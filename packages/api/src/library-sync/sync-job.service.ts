import { randomUUID } from "node:crypto";
import {
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuditService } from "../academies/audit.service.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { runCopySync, StaleLeaseError } from "./sync-run.js";
import { SyncWriteError } from "./writer.js";
import { NotificationBroadcaster } from "../notifications/notification-broadcaster.js";

/**
 * Durable library-sync jobs, drained in the API process (design §14, D10).
 *
 * The `ShortAnswerService` shape: a drain is requested right after a release
 * is published, and a recovery tick picks up expired leases and work queued
 * by another instance. A claim is a conditional update over
 * `FOR UPDATE SKIP LOCKED`, so instances never take the same job, and the
 * partial unique index on RUNNING keeps one active run per copy.
 *
 * A run holds its job row locked for its whole transaction, and its first
 * act is to prove its lease is still current: a worker that lost its lease
 * cannot commit content or completion.
 */

export const LIBRARY_SYNC_MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 120;
const RECOVERY_INTERVAL_MS = 30_000;
const RUN_TIMEOUT_MS = 60_000;

/** 30 s, 60 s, 2 min … capped at an hour. */
export function backoffSeconds(attempts: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

@Injectable()
export class LibrarySyncJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LibrarySyncJobService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = 0;
  private requested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly audit: AuditService,
    private readonly revocation: MonitoringRevocationService,
    @Optional() private readonly notifications?: NotificationBroadcaster,
  ) {}

  enabled() {
    return this.config.get("LIBRARY_SYNC_ENABLED", { infer: true }) === true;
  }

  onModuleInit() {
    this.timer = setInterval(() => this.requestDrain(), RECOVERY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Drain now. A request during a drain runs one more pass after it. */
  requestDrain() {
    if (!this.enabled()) return;
    this.requested = true;
    const concurrency =
      this.config.get("LIBRARY_SYNC_CONCURRENCY", { infer: true }) ?? 1;
    while (this.running < concurrency) {
      this.running += 1;
      void this.drain()
        .catch((error: unknown) =>
          this.logger.error(`Library sync drain failed: ${String(error)}`),
        )
        .finally(() => {
          this.running -= 1;
          if (this.requested && this.running === 0) this.requestDrain();
        });
    }
  }

  /** Claim and run jobs until none is eligible. Returns how many ran. */
  async drain(): Promise<number> {
    this.requested = false;
    await this.recoverExpiredLeases();
    let ran = 0;
    for (;;) {
      const job = await this.claim();
      if (!job) return ran;
      ran += 1;
      await this.runClaimed(job);
    }
  }

  /** One run of one claimed job. Exposed for tests and for an explicit retry. */
  async runClaimed(job: {
    id: string;
    copyCourseId: string;
    leaseId: string;
    attempts: number;
  }) {
    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const outcome = await runCopySync(tx, this.audit, {
            copyCourseId: job.copyCourseId,
            fence: { jobId: job.id, leaseId: job.leaseId },
          });
          if (outcome.status === "SKIPPED" && outcome.reason !== "UP_TO_DATE") {
            // Paused or switched off between claim and run: wait, unclaimed.
            await tx.$executeRaw`
              UPDATE library_sync_jobs SET status = CASE WHEN EXISTS (
                  SELECT 1 FROM library_sync_jobs p WHERE p.copy_course_id = ${job.copyCourseId}::uuid AND p.status = 'PENDING')
                THEN 'SUCCEEDED'::"LibrarySyncJobStatus" ELSE 'PENDING'::"LibrarySyncJobStatus" END,
                lease_id = NULL, lease_until = NULL, next_attempt_at = now() + interval '5 minutes'
              WHERE id = ${job.id}::uuid AND lease_id = ${job.leaseId}::uuid`;
            return outcome;
          }
          await tx.$executeRaw`
            UPDATE library_sync_jobs SET status = 'SUCCEEDED', finished_at = now(), lease_id = NULL, lease_until = NULL,
              last_error_code = NULL, summary = ${JSON.stringify(outcome.status === "APPLIED" ? outcome.summary : { skipped: outcome.reason })}::jsonb
            WHERE id = ${job.id}::uuid AND lease_id = ${job.leaseId}::uuid`;
          return outcome;
        },
        { maxWait: 5_000, timeout: RUN_TIMEOUT_MS },
      );
      if (result.status === "APPLIED" && result.archivedLocalIds.length)
        await this.revokeCourse(job.copyCourseId);
      if (result.status === "APPLIED" && result.reviewChanged) await this.notifications?.courseReviewChanged(job.copyCourseId);
      return result;
    } catch (error) {
      if (error instanceof StaleLeaseError) return null;
      await this.fail(job, error);
      return null;
    }
  }

  private async fail(
    job: {
      id: string;
      copyCourseId: string;
      leaseId: string;
      attempts: number;
    },
    error: unknown,
  ) {
    const code =
      error instanceof SyncWriteError ? error.code : errorCode(error);
    this.logger.warn(
      `Library sync job ${job.id} failed (${code}) on attempt ${job.attempts}`,
    );
    const final = job.attempts >= LIBRARY_SYNC_MAX_ATTEMPTS;
    const delay = backoffSeconds(job.attempts);
    await this.prisma.$transaction(async (tx) => {
      // A newer pending job supersedes this one: it will start from the same state.
      await tx.$executeRaw`
        UPDATE library_sync_jobs SET
          status = CASE WHEN ${final} OR EXISTS (
              SELECT 1 FROM library_sync_jobs p WHERE p.copy_course_id = ${job.copyCourseId}::uuid AND p.status = 'PENDING')
            THEN 'FAILED'::"LibrarySyncJobStatus" ELSE 'PENDING'::"LibrarySyncJobStatus" END,
          lease_id = NULL, lease_until = NULL, last_error_code = ${code},
          next_attempt_at = now() + make_interval(secs => ${delay}),
          finished_at = CASE WHEN ${final} THEN now() ELSE NULL END
        WHERE id = ${job.id}::uuid AND lease_id = ${job.leaseId}::uuid`;
      await tx.$executeRaw`
        UPDATE course_sync_states SET last_error_code = ${code},
          status = CASE WHEN ${final} THEN 'FAILED'::"LibrarySyncStatus" ELSE status END, updated_at = now()
        WHERE course_id = ${job.copyCourseId}::uuid`;
    });
  }

  /**
   * The next eligible job: pending, due, its copy not paused and not already
   * running, and its academy's rollout gate on.
   */
  async claim(): Promise<{
    id: string;
    copyCourseId: string;
    leaseId: string;
    attempts: number;
  } | null> {
    const leaseId = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; copy_course_id: string; attempts: number }>
    >`
      UPDATE library_sync_jobs SET status = 'RUNNING', lease_id = ${leaseId}::uuid,
        lease_until = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = attempts + 1, started_at = now()
      WHERE id = (
        SELECT j.id FROM library_sync_jobs j
        JOIN course_sync_states s ON s.course_id = j.copy_course_id
        JOIN courses c ON c.id = j.copy_course_id
        WHERE j.status = 'PENDING' AND j.next_attempt_at <= now() AND s.paused_at IS NULL
          AND EXISTS (SELECT 1 FROM academy_feature_flags f
                      WHERE f.academy_id = c.academy_id AND f.feature = 'LIBRARY_COURSE_SYNC' AND f.is_enabled)
          AND NOT EXISTS (SELECT 1 FROM library_sync_jobs r WHERE r.copy_course_id = j.copy_course_id AND r.status = 'RUNNING')
        ORDER BY j.next_attempt_at, j.created_at
        FOR UPDATE OF j SKIP LOCKED
        LIMIT 1)
      RETURNING id, copy_course_id, attempts`;
    const row = rows[0];
    return row
      ? {
          id: row.id,
          copyCourseId: row.copy_course_id,
          leaseId,
          attempts: row.attempts,
        }
      : null;
  }

  /** A run whose process died keeps its lease until expiry; then it is retried. */
  async recoverExpiredLeases() {
    await this.prisma.$executeRaw`
      UPDATE library_sync_jobs j SET
        status = CASE WHEN EXISTS (SELECT 1 FROM library_sync_jobs p WHERE p.copy_course_id = j.copy_course_id AND p.status = 'PENDING')
          THEN 'FAILED'::"LibrarySyncJobStatus" ELSE 'PENDING'::"LibrarySyncJobStatus" END,
        lease_id = NULL, lease_until = NULL, last_error_code = 'LEASE_EXPIRED', next_attempt_at = now()
      WHERE j.status = 'RUNNING' AND j.lease_until < now()`;
  }

  private async revokeCourse(courseId: string) {
    const assignments = await this.prisma.classCourse.findMany({
      where: { courseId },
      select: { classId: true },
    });
    await Promise.all(
      assignments.map(({ classId }) =>
        this.revocation.revokeClass(classId, "MATERIAL_UNAVAILABLE"),
      ),
    );
  }
}

function errorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  )
    return (error as { code: string }).code.slice(0, 64);
  return "SYNC_FAILED";
}
