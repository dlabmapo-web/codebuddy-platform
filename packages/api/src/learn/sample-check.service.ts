import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  isSampleCheckActive,
  type SampleCheckView,
  type StartSampleCheckInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  gradingSnapshotFor,
  gradingPolicySnapshotSchema,
  resolveGradingProfile,
} from "../judge/grading-profile.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { SAMPLE_QUEUE_WAIT_MS } from "../judge/sample-check.runner.js";
import {
  SampleCheckStore,
  type SampleCheckRecord,
} from "../judge/sample-check.store.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { LearningClassContextService } from "./learning-class-context.service.js";

/** Beyond the run's own bounds, before an active check is presumed lost. */
const LOST_SLACK_MS = 60_000;

const exerciseInclude = {
  programmingExercise: {
    include: { testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  },
  lecture: { include: { courseModule: { select: { courseId: true } } } },
} satisfies Prisma.MaterialInclude;

/**
 * Public sample checks: a student's Test button, judged by the server.
 *
 * This service admits a check and reads it back; the judge runs it
 * (`sample-check.runner.ts`). It reuses every access rule Submit applies —
 * the student's own permission, curriculum reachability, and an authorized
 * class context — and none of Submit's consequences: it never creates a
 * submission, never counts an attempt, never touches progress, best score,
 * points or answer history, and admits a check even when a student's official
 * attempts would be refused.
 *
 * Only the selected SAMPLE case is ever loaded into a check. A hidden case,
 * a nonexistent position, another academy's problem and another student's
 * check all answer the same way, and none of their definitions leave here.
 */
@Injectable()
export class SampleCheckService {
  private readonly logger = new Logger(SampleCheckService.name);
  private readonly store: SampleCheckStore | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly classContext: LearningClassContextService,
    @Optional() private readonly queue?: JudgeQueue,
  ) {
    this.store = queue ? new SampleCheckStore(() => queue.redis()) : null;
  }

  async start(
    identity: SupabaseIdentity,
    input: StartSampleCheckInput,
  ): Promise<SampleCheckView> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "submissions.own.create",
    );
    const { userId } = actor;
    const store = this.store;
    const queue = this.queue;
    if (!store || !queue) throw unavailable();

    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        ...reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor)),
      },
      include: exerciseInclude,
    });
    const exercise = material?.programmingExercise;
    if (!material || !exercise) throw notFound();

    // An authorized class context, exactly as Submit requires one. Practice
    // is still work done in a class.
    await this.classContext.resolve({
      academyId: input.academyId,
      userId,
      courseId: material.lecture.courseModule.courseId,
      requestedClassId: input.classId,
    });

    if (!(await this.enabledFor(input.academyId)) || exercise.gradingMode !== "ELICE_STDIO") {
      // Legacy samples are judged in the browser, and a disabled academy
      // keeps today's behaviour: neither has a server check to start.
      throw unavailable();
    }
    if (exercise.gradingRevision !== input.workspaceRevision) {
      throw new AppException("SAMPLE_CHECK_STALE", HttpStatus.CONFLICT);
    }
    const testCase = exercise.testCases.find(
      (candidate) =>
        candidate.position === input.position && candidate.visibility === "SAMPLE",
    );
    // Hidden and nonexistent positions are indistinguishable from here.
    if (!testCase) throw notFound();

    const profile = resolveGradingProfile(exercise, exercise.testCases);
    if (profile.kind !== "elice") throw unavailable();
    const engineVersion = this.config.get("PYODIDE_VERSION", { infer: true });
    // The one case, snapshotted by the same function a submission uses, so
    // its limits and runtime identity are resolved exactly as Submit's.
    const snapshot = gradingSnapshotFor(
      { ...exercise, testCases: [testCase] },
      { engineVersion },
    );
    const policy = gradingPolicySnapshotSchema.parse(snapshot.submission.gradingPolicySnapshot);
    const snapshotCase = snapshot.cases[0]!;

    const codeHash = sha256(input.code);
    const requestHash = sha256(
      JSON.stringify([
        input.materialId,
        input.classId,
        input.position,
        input.workspaceRevision,
        codeHash,
      ]),
    );

    try {
      const now = Date.now();
      const record: SampleCheckRecord = {
        checkId: randomUUID(),
        userId,
        academyId: input.academyId,
        classId: input.classId,
        materialId: material.id,
        position: testCase.position,
        exerciseRevision: exercise.gradingRevision,
        codeHash,
        requestHash,
        clientRequestId: input.clientRequestId,
        status: "QUEUED",
        acceptedAt: now,
        dispatchedAt: null,
        finishedAt: null,
        lostAfter: now + SAMPLE_QUEUE_WAIT_MS + profile.totalTimeLimitMs + LOST_SLACK_MS,
        snapshot: {
          code: input.code,
          memoryLimitMb: exercise.memoryLimitMb,
          totalTimeLimitMs: profile.totalTimeLimitMs,
          comparatorTimeLimitMs: profile.comparatorTimeLimitMs,
          policy,
          testCase: {
            input: snapshotCase.input,
            expectedOutput: snapshotCase.expectedOutput,
            comparator: snapshotCase.comparator,
            softTimeLimitMs: snapshotCase.softTimeLimitMs,
            caseLimitMs: snapshotCase.effectiveTimeLimitMs ?? exercise.timeLimitMs,
          },
        },
        result: null,
        failure: null,
        timings: { queueMs: null, executionMs: null, comparisonMs: null },
      };

      // Deduplication, the rate limit and both outstanding limits in one call:
      // two retries of one click cannot each spend a token on their way to
      // being deduplicated.
      const admission = await store.admit(record, {
        academyOutstanding: this.config.get("SAMPLE_CHECK_ACADEMY_OUTSTANDING", {
          infer: true,
        }),
        perMinute: this.config.get("SAMPLE_CHECK_PER_MINUTE", { infer: true }),
      });
      if (admission.kind === "duplicate") {
        return this.replay(store, admission.checkId, requestHash);
      }
      if (admission.kind === "rate-limited") {
        throw new AppException("SAMPLE_CHECK_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
      }
      if (admission.kind === "busy") {
        throw new AppException("SAMPLE_CHECK_BUSY", HttpStatus.CONFLICT);
      }
      if (admission.kind === "academy-full") {
        throw new AppException("SAMPLE_CHECK_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
      }

      try {
        await queue.enqueueSampleCheck(record.checkId);
      } catch (error) {
        this.logger.error(`sample check ${record.checkId} could not be queued: ${String(error)}`);
        await store.transition(record, ["QUEUED"], {
          status: "UNAVAILABLE",
          failure: "ENQUEUE_FAILED",
          finishedAt: Date.now(),
        });
        throw unavailable();
      }
      return toView(record, true);
    } catch (error) {
      if (error instanceof AppException) throw error;
      // Redis itself is down. Never a silent local pass or fail.
      this.logger.error(`sample check store unavailable: ${String(error)}`);
      throw unavailable();
    }
  }

  /**
   * A check, reauthorized: holding its id grants nothing. A check that is not
   * this student's reads exactly as an expired one does.
   */
  async get(
    identity: SupabaseIdentity,
    input: { academyId: string; checkId: string },
  ): Promise<SampleCheckView> {
    const { store, record, visible } = await this.readOwned(identity, input);
    if (!record) return expiredView(input.checkId);
    return toView((await this.endIfOverdue(store, record)) ?? record, visible);
  }

  /**
   * Ends a check that has outstayed its limits, on the read that notices.
   *
   * The ten-second queue wait is measured from acceptance, but the worker can
   * only check it once it has picked the job up — so a judge with every slot
   * busy leaves a student watching "Queued" long past the limit they were
   * promised, and holding the outstanding slot that stops them starting
   * another. Whoever reads the check next ends it instead.
   *
   * Both endings are compare-and-set from an active status, so a worker
   * claiming the job at the same moment wins and keeps its run; this read then
   * reports whatever the worker made of it.
   */
  private async endIfOverdue(
    store: SampleCheckStore,
    record: SampleCheckRecord,
  ): Promise<SampleCheckRecord | null> {
    const now = Date.now();
    if (record.status === "QUEUED" && now > record.acceptedAt + SAMPLE_QUEUE_WAIT_MS) {
      const expired = await store.transition(record, ["QUEUED"], {
        status: "TIMED_OUT",
        failure: "QUEUE_WAIT",
        finishedAt: now,
      });
      if (!expired) return store.get(record.checkId);
      // Terminal, so its admission markers are freed in the same write and the
      // student may start another check at once. The job it never reached is
      // dropped rather than left to produce a result nobody is waiting for.
      await this.queue?.removeSampleCheck(record.checkId).catch(() => undefined);
      return expired;
    }
    if (isSampleCheckActive(record.status) && now > record.lostAfter) {
      // The job died without finishing. Reported as ours, not the student's.
      return store.transition(record, ["QUEUED", "RUNNING", "STOPPING"], {
        status: "UNAVAILABLE",
        failure: "WORKER_LOST",
        finishedAt: now,
      });
    }
    return null;
  }

  /**
   * Stops a check. Queued work is removed at once; running work cannot be
   * interrupted mid-case in this release, so it becomes `STOPPING` and holds
   * its slot until its bounded run ends — capacity is never marked free just
   * because someone stopped waiting. Idempotent.
   */
  async cancel(
    identity: SupabaseIdentity,
    input: { academyId: string; checkId: string },
  ): Promise<SampleCheckView> {
    const { store, record, visible } = await this.readOwned(identity, input);
    if (!record) return expiredView(input.checkId);
    if (record.status === "QUEUED") {
      const cancelled = await store.transition(record, ["QUEUED"], {
        status: "CANCELLED",
        finishedAt: Date.now(),
      });
      if (cancelled) {
        await this.queue?.removeSampleCheck(record.checkId).catch(() => undefined);
        return toView(cancelled, visible);
      }
    }
    if (record.status === "RUNNING" || record.status === "QUEUED") {
      const stopping = await store.transition(record, ["RUNNING"], {
        status: "STOPPING",
      });
      if (stopping) return toView(stopping, visible);
    }
    const latest = await store.get(record.checkId);
    return latest ? toView(latest, visible) : expiredView(input.checkId);
  }

  private async readOwned(
    identity: SupabaseIdentity,
    input: { academyId: string; checkId: string },
  ): Promise<{
    store: SampleCheckStore;
    record: SampleCheckRecord | null;
    visible: boolean;
  }> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.read",
    );
    const store = this.store;
    if (!store) throw unavailable();
    let record: SampleCheckRecord | null;
    try {
      record = await store.get(input.checkId);
    } catch (error) {
      this.logger.error(`sample check store unavailable: ${String(error)}`);
      throw unavailable();
    }
    if (!record || record.userId !== actor.userId || record.academyId !== input.academyId) {
      return { store, record: null, visible: false };
    }
    // Current access, not access at acceptance: a student who has since lost
    // the course reads nothing more about it.
    const material = await this.prisma.material.findFirst({
      where: {
        id: record.materialId,
        ...reachableMaterialWhere(input.academyId, learningScopeFor(input.academyId, actor)),
      },
      include: exerciseInclude,
    });
    const exercise = material?.programmingExercise;
    if (!exercise) throw notFound();
    // The rule is shown only while this exact case is still public at this
    // revision. A reordered or hidden case withholds it rather than risk
    // describing a different case under the same position.
    const visible =
      exercise.gradingRevision === record.exerciseRevision &&
      exercise.testCases.some(
        (candidate) =>
          candidate.position === record!.position && candidate.visibility === "SAMPLE",
      );
    return { store, record, visible };
  }

  private async replay(
    store: SampleCheckStore,
    checkId: string,
    requestHash: string,
  ): Promise<SampleCheckView> {
    const record = await store.get(checkId);
    if (!record) return expiredView(checkId);
    if (record.requestHash !== requestHash) {
      throw new AppException("SAMPLE_CHECK_CONFLICT", HttpStatus.CONFLICT);
    }
    return toView(record, true);
  }

  private async enabledFor(academyId: string): Promise<boolean> {
    const flag = await this.prisma.academyFeatureFlag.findUnique({
      where: { academyId_feature: { academyId, feature: "SERVER_SAMPLE_CHECKS" } },
      select: { isEnabled: true },
    });
    return flag?.isEnabled ?? false;
  }
}

/** The public projection. The snapshot's code never leaves; its case only if still public. */
export function toView(record: SampleCheckRecord, visible: boolean): SampleCheckView {
  return {
    checkId: record.checkId,
    status: record.status,
    position: record.position,
    codeHash: record.codeHash,
    exerciseRevision: record.exerciseRevision,
    result:
      record.status === "COMPLETED" && record.result
        ? {
            ...record.result,
            rule: visible
              ? {
                  comparator: record.snapshot.testCase.comparator,
                  expected: record.snapshot.testCase.expectedOutput,
                }
              : null,
          }
        : null,
    refreshRequired: !visible,
    timings: record.timings,
  };
}

function expiredView(checkId: string): SampleCheckView {
  return {
    checkId,
    status: "EXPIRED",
    position: null,
    codeHash: null,
    exerciseRevision: null,
    result: null,
    refreshRequired: false,
    timings: { queueMs: null, executionMs: null, comparisonMs: null },
  };
}

function notFound(): AppException {
  return new AppException("SAMPLE_CHECK_NOT_FOUND", HttpStatus.NOT_FOUND);
}

function unavailable(): AppException {
  return new AppException("SAMPLE_CHECK_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
