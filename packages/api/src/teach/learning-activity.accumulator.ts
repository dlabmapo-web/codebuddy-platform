import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  ACADEMY_TIME_ZONE,
  ACTIVITY_FLUSH_INTERVAL_MS,
  ACTIVITY_MAX_GAP_MS,
  academyLocalDate,
  heartbeatActiveSeconds,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import {
  MONITORING_REDIS,
  monitoringKeyPrefix,
  type MonitoringRedis,
} from "../monitoring/monitoring.tokens.js";

/**
 * Heartbeats in, bounded daily seconds out.
 *
 * This is the only writer of active learning time, and everything it refuses to
 * do is deliberate. It never accepts a duration from a client — a browser that
 * could report "I studied for two hours" would be reporting a number nobody can
 * check. It never bills a gap it did not observe: a slept laptop, a hidden tab,
 * a dropped socket, or a minute of stillness all close the interval, and the
 * next beat opens a new one. And it never writes a row per heartbeat; a class of
 * a hundred beats four hundred times a minute, so seconds accumulate in Redis
 * and reach PostgreSQL as one increment a minute per student.
 *
 * Losing Redis loses at most the unflushed minute. It cannot invent time,
 * because every second in it was earned by a beat that already happened.
 *
 * See §7.1 and §7.2 of the teacher academy overview design.
 */

/** What one student's open interval looks like between two beats. */
type ActivityState = {
  academyId: string;
  membershipId: string;
  courseId: string;
  /** The academy-local day the pending seconds belong to. */
  localDate: string;
  lastAcceptedAt: number;
  pendingSeconds: number;
  pendingIntervals: number;
  firstActiveAt: number;
  lastActiveAt: number;
  flushedAt: number;
  /** Stable for the exact pending increment until its commit is known. */
  flushId: string;
  /** Once attempted, the increment is frozen until this ID succeeds. */
  flushPending: boolean;
};

export type ActivitySignal = {
  academyId: string;
  membershipId: string;
  /** The course the server verified, never the one the client named. */
  courseId: string;
  /** True only when the student did something, not merely that a beat arrived. */
  active: boolean;
  now?: number;
};

/** A flush, as the durable write and the retry queue both see it. */
export type ActivityIncrement = {
  flushId: string;
  academyId: string;
  membershipId: string;
  courseId: string;
  localDate: string;
  seconds: number;
  intervals: number;
  firstActiveAt: Date;
  lastActiveAt: Date;
};

/** A key expires well after the widest gap that could still extend an interval. */
const stateTtlMs = ACTIVITY_MAX_GAP_MS + ACTIVITY_FLUSH_INTERVAL_MS * 2;
const pendingStateTtlMs = 7 * 86_400_000;
const retrySetKey = `${monitoringKeyPrefix}activity-retries`;

@Injectable()
export class LearningActivityAccumulator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LearningActivityAccumulator.name);
  private readonly localLocks = new Map<string, Promise<void>>();
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * The fallback store, used when no Redis is configured.
   *
   * A websocket pins one student to one API instance for the life of their
   * connection, so process memory holds the same state Redis would. It is a
   * fallback rather than the design because a restart mid-lesson would drop
   * everyone's open interval at once, and because a second tab on another
   * instance would open a second interval — neither of which double-counts a
   * second, since each interval is still capped by the beats that earned it.
   */
  private readonly local = new Map<string, ActivityState>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis,
  ) {}

  onModuleInit(): void {
    this.retryTimer = setInterval(() => {
      void this.retryPendingStates();
    }, ACTIVITY_FLUSH_INTERVAL_MS);
    this.retryTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * One accepted heartbeat.
   *
   * The caller has already proved the student is authenticated, inside a
   * visible learning surface of this academy and course, and foreground. This
   * decides what the beat is worth and whether a minute is due.
   */
  async record(signal: ActivitySignal): Promise<void> {
    const key = stateKey(signal.membershipId, signal.courseId);
    await this.withStateLock(key, () => this.recordLocked(key, signal));
  }

  private async recordLocked(
    key: string,
    signal: ActivitySignal,
  ): Promise<void> {
    const now = signal.now ?? Date.now();
    const previous = await this.readState(key);

    // An ambiguous commit freezes the exact increment. Retrying it with the
    // same ID is safe; appending new seconds to that ID is not.
    if (previous?.flushPending) {
      if (!(await this.flush(previous, now))) return;
      previous.pendingSeconds = 0;
      previous.pendingIntervals = 0;
      previous.firstActiveAt = now;
      previous.flushedAt = now;
      previous.flushId = randomUUID();
      previous.flushPending = false;
      await this.writeState(key, previous);
    }

    // Inactive beats keep the connection alive and buy nothing. An open tab is
    // not learning, and §4 rules out counting it as such.
    if (!signal.active) {
      if (previous && previous.pendingSeconds > 0) {
        previous.flushPending = true;
        await this.writeState(key, previous);
        if (!(await this.flush(previous, now))) return;
      }
      await this.clearState(key);
      return;
    }

    const localDate = academyLocalDate(new Date(now), ACADEMY_TIME_ZONE);
    // A beat that crosses local midnight closes the day it belonged to, so a
    // late-evening session is not backdated into tomorrow's total.
    const carriedOver = previous && previous.localDate !== localDate;
    if (previous && carriedOver) {
      previous.flushPending = true;
      await this.writeState(key, previous);
      if (!(await this.flush(previous, now))) return;
    }

    // The anchor survives the rollover even though the counters do not: a
    // student working at 23:59:55 and again at 00:00:05 was working, and only
    // the day the seconds land on changes. Attributing that one interval to
    // the new day is at most a heartbeat of drift, where dropping it would
    // silently lose time every single evening.
    const continuing = previous && !carriedOver ? previous : null;
    const earned = heartbeatActiveSeconds({
      lastAcceptedAt: previous?.lastAcceptedAt ?? null,
      now,
    });

    const next: ActivityState = {
      academyId: signal.academyId,
      membershipId: signal.membershipId,
      courseId: signal.courseId,
      localDate,
      lastAcceptedAt: now,
      pendingSeconds: (continuing?.pendingSeconds ?? 0) + earned,
      // Zero earned seconds means the previous beat was too far back to extend
      // the interval, so this beat opens a new one.
      pendingIntervals: (continuing?.pendingIntervals ?? 0) + (earned > 0 ? 0 : 1),
      firstActiveAt: continuing?.firstActiveAt ?? now,
      lastActiveAt: now,
      flushedAt: continuing?.flushedAt ?? now,
      flushId: continuing?.flushId ?? randomUUID(),
      flushPending: false,
    };

    if (
      next.pendingSeconds > 0 &&
      now - next.flushedAt >= ACTIVITY_FLUSH_INTERVAL_MS
    ) {
      next.flushPending = true;
      await this.writeState(key, next);
      const flushed = await this.flush(next, now);
      if (flushed) {
        next.pendingSeconds = 0;
        next.pendingIntervals = 0;
        next.firstActiveAt = now;
        next.flushId = randomUUID();
        next.flushPending = false;
      }
      if (flushed) next.flushedAt = now;
    }

    await this.writeState(key, next);
  }

  /**
   * A clean disconnect: write what was earned rather than dropping the minute.
   *
   * Best effort by construction. A crashed browser never reaches this, and the
   * key then lapses with its unflushed seconds — an undercount, which is the
   * safe direction for a number a teacher reads as "at least this much".
   */
  async close(membershipId: string, courseId: string): Promise<void> {
    const key = stateKey(membershipId, courseId);
    await this.withStateLock(key, () => this.closeLocked(key));
  }

  private async closeLocked(key: string): Promise<void> {
    const state = await this.readState(key);
    if (state && state.pendingSeconds > 0) {
      state.flushPending = true;
      await this.writeState(key, state);
      if (!(await this.flush(state, Date.now()))) return;
    }
    await this.clearState(key);
  }

  /**
   * The durable increment, once.
   *
   * The receipt and the increment are one transaction, and the receipt's
   * primary key is what makes a retry a no-op: a flush that timed out after
   * committing finds its own id already present and adds nothing.
   */
  async apply(increment: ActivityIncrement): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const receipt = await tx.learningActivityFlush.createMany({
          data: {
            id: increment.flushId,
            academyId: increment.academyId,
            membershipId: increment.membershipId,
          },
          skipDuplicates: true,
        });
        // Already applied. Reporting success is correct: the caller's seconds
        // are in the projection, written by the attempt that got there first.
        if (receipt.count === 0) return true;

        await tx.studentCourseLearningDay.upsert({
          where: {
            academyId_membershipId_courseId_localDate: {
              academyId: increment.academyId,
              membershipId: increment.membershipId,
              courseId: increment.courseId,
              localDate: new Date(`${increment.localDate}T00:00:00.000Z`),
            },
          },
          create: {
            academyId: increment.academyId,
            membershipId: increment.membershipId,
            courseId: increment.courseId,
            localDate: new Date(`${increment.localDate}T00:00:00.000Z`),
            activeSeconds: increment.seconds,
            activeIntervals: increment.intervals,
            firstActiveAt: increment.firstActiveAt,
            lastActiveAt: increment.lastActiveAt,
          },
          update: {
            activeSeconds: { increment: increment.seconds },
            activeIntervals: { increment: increment.intervals },
            lastActiveAt: increment.lastActiveAt,
          },
        });
        return true;
      });
    } catch (error) {
      this.logger.warn(
        `learning activity flush ${increment.flushId} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return false;
    }
  }

  /** Sweeps receipts past the retention window. Safe to call repeatedly. */
  async pruneReceipts(before: Date): Promise<number> {
    const removed = await this.prisma.learningActivityFlush.deleteMany({
      where: { createdAt: { lt: before } },
    });
    return removed.count;
  }

  private async flush(state: ActivityState, now: number): Promise<boolean> {
    if (state.pendingSeconds <= 0) return true;
    return this.apply({
      flushId: state.flushId,
      academyId: state.academyId,
      membershipId: state.membershipId,
      courseId: state.courseId,
      localDate: state.localDate,
      seconds: state.pendingSeconds,
      intervals: Math.max(1, state.pendingIntervals),
      firstActiveAt: new Date(state.firstActiveAt),
      lastActiveAt: new Date(Math.min(state.lastActiveAt, now)),
    });
  }

  /** Serialize one membership/course read-modify-write across tabs and nodes. */
  private async withStateLock(
    key: string,
    run: () => Promise<void>,
  ): Promise<void> {
    if (!this.redis) return this.withLocalLock(key, run);

    const lockKey = `${key}:lock`;
    const token = randomUUID();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const acquired = await this.redis.set(lockKey, token, "PX", 5_000, "NX");
      if (acquired === "OK") {
        try {
          await run();
        } finally {
          await this.redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            lockKey,
            token,
          );
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    this.logger.warn("activity state lock timed out");
  }

  private async withLocalLock(
    key: string,
    run: () => Promise<void>,
  ): Promise<void> {
    const previous = this.localLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.localLocks.set(key, current);
    await previous;
    try {
      await run();
    } finally {
      release();
      if (this.localLocks.get(key) === current) this.localLocks.delete(key);
    }
  }

  /** Retry frozen increments even when the browser disconnected after failure. */
  private async retryPendingStates(): Promise<void> {
    const keys = this.redis
      ? await this.redis.smembers(retrySetKey).catch(() => [])
      : [...this.local.entries()]
          .filter(([, state]) => state.flushPending)
          .map(([key]) => key);
    await Promise.all(
      keys.map((key) =>
        this.withStateLock(key, async () => {
          const state = await this.readState(key);
          if (!state?.flushPending) return;
          if (await this.flush(state, Date.now())) await this.clearState(key);
        }),
      ),
    );
  }

  /* ----------------------------------------------------------------- store */

  private async readState(key: string): Promise<ActivityState | null> {
    if (!this.redis) return this.local.get(key) ?? null;
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      const state = JSON.parse(raw) as Partial<ActivityState> & ActivityState;
      return {
        ...state,
        flushId: state.flushId ?? randomUUID(),
        flushPending: state.flushPending ?? false,
      };
    } catch (error) {
      this.logger.warn(
        `activity state read failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return null;
    }
  }

  private async writeState(key: string, state: ActivityState): Promise<void> {
    if (!this.redis) {
      this.local.set(key, state);
      return;
    }
    try {
      const ttl = state.flushPending ? pendingStateTtlMs : stateTtlMs;
      const transaction = this.redis
        .multi()
        .set(key, JSON.stringify(state), "PX", ttl);
      if (state.flushPending) transaction.sadd(retrySetKey, key);
      else transaction.srem(retrySetKey, key);
      await transaction.exec();
    } catch {
      // A Redis blip loses one student's open interval, not the projection.
      // The next beat opens a fresh one, which undercounts by a heartbeat.
    }
  }

  private async clearState(key: string): Promise<void> {
    if (!this.redis) {
      this.local.delete(key);
      return;
    }
    try {
      await this.redis.multi().del(key).srem(retrySetKey, key).exec();
    } catch {
      // The key carries a TTL, so a failed delete expires on its own.
    }
  }
}

/** One namespace, separate from presence, so a flush cannot read a roster. */
function stateKey(membershipId: string, courseId: string): string {
  return `${monitoringKeyPrefix}act:${membershipId}:${courseId}`;
}
