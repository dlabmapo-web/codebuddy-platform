import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  monitoringLimits,
  monitoringTiming,
  resolveLiveState,
  type MonitoringLiveState,
  type PresenceEntry,
  type PresenceSnapshot,
  type WorkspaceVisibility,
} from "@cove/shared";

import {
  MONITORING_REDIS,
  monitoringKeyPrefix,
  type MonitoringRedis,
} from "./monitoring.tokens.js";

/**
 * Who is connected, in Redis, with a TTL.
 *
 * Presence expires on its own. That is the point: an API instance that dies
 * mid-class leaves keys that lapse within a heartbeat or two, where a database
 * flag would leave a roster full of students who went home an hour ago.
 *
 * Every value is written by the server from signals it verified. A client
 * publishes what it is doing, never what state it is in.
 */

type StoredPresence = {
  studentMembershipId: string;
  classId: string;
  /** Distinguishes a reconnect from a second tab of the same student. */
  socketGeneration: string;
  materialId: string | null;
  courseId: string | null;
  visibility: WorkspaceVisibility;
  lastActivityAt: number;
  connectedAt: number;
  interruptedAt: number | null;
  run: PresenceEntry["run"];
  latestSubmissionId: string | null;
};

export type PresenceSignal = {
  academyId: string;
  classId: string;
  studentMembershipId: string;
  socketGeneration: string;
  materialId: string | null;
  courseId: string | null;
  visibility: WorkspaceVisibility;
  /** True when the student did something, not merely that a beat arrived. */
  active: boolean;
};

/**
 * A key expires shortly after the heartbeat that should have refreshed it. Two
 * missed beats plus the recovery grace keeps a brief network stall from
 * blanking a roster while still expiring a genuinely gone connection.
 */
const presenceTtlMs =
  monitoringTiming.presenceHeartbeatMs * 2 + monitoringTiming.recoveryGraceMs;

/**
 * Compare the departing socket generation and mark it interrupted as one Redis
 * operation. A JavaScript read followed by a write can interleave with a new
 * connection's publish and overwrite that newer session with stale state.
 */
const markInterruptedScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end

local decoded, stored = pcall(cjson.decode, raw)
if not decoded then return nil end
if stored.socketGeneration ~= ARGV[1] then return nil end

stored.interruptedAt = tonumber(ARGV[2])
local updated = cjson.encode(stored)
redis.call('PSETEX', KEYS[1], tonumber(ARGV[3]), updated)
return updated
`;

@Injectable()
export class PresenceRegistry {
  private readonly logger = new Logger(PresenceRegistry.name);
  /** Latched by a failed command so callers stop asking on every event. */
  private degraded = false;

  constructor(
    @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis,
  ) {
    if (this.redis && typeof this.redis.on === "function") {
      this.redis.on("ready", () => this.recover());
    }
  }

  /** Realtime presence is unavailable, and must be shown as such. */
  get isAvailable(): boolean {
    return this.redis !== null && !this.degraded;
  }

  /**
   * Records one student's signals and returns the state the server derived.
   *
   * The stored `lastActivityAt` only moves on real activity, so a student who
   * leaves a tab open heartbeating goes idle exactly as the roster claims.
   */
  async publish(signal: PresenceSignal): Promise<PresenceEntry | null> {
    const redis = this.client();
    if (!redis) return null;
    const now = Date.now();
    const previous = await this.read(
      redis,
      signal.academyId,
      signal.classId,
      signal.studentMembershipId,
    );
    const stored: StoredPresence = {
      studentMembershipId: signal.studentMembershipId,
      classId: signal.classId,
      socketGeneration: signal.socketGeneration,
      materialId: signal.materialId,
      courseId: signal.courseId,
      visibility: signal.visibility,
      lastActivityAt: signal.active ? now : previous?.lastActivityAt ?? now,
      connectedAt: previous?.connectedAt ?? now,
      interruptedAt: null,
      run: previous?.run ?? null,
      latestSubmissionId: previous?.latestSubmissionId ?? null,
    };
    return this.write(redis, signal.academyId, stored, now);
  }

  /** A student's own sample run, attached to the row the roster already shows. */
  async recordRun(
    academyId: string,
    classId: string,
    studentMembershipId: string,
    run: NonNullable<PresenceEntry["run"]>,
  ): Promise<PresenceEntry | null> {
    return this.mutate(academyId, classId, studentMembershipId, (stored, now) => ({
      ...stored,
      run,
      lastActivityAt: now,
    }));
  }

  async recordSubmission(
    academyId: string,
    classId: string,
    studentMembershipId: string,
    submissionId: string,
  ): Promise<PresenceEntry | null> {
    return this.mutate(academyId, classId, studentMembershipId, (stored) => ({
      ...stored,
      latestSubmissionId: submissionId,
    }));
  }

  /**
   * Marks a dropped connection as recoverable rather than deleting it.
   *
   * A student whose train enters a tunnel must read as reconnecting for the
   * grace window; deleting the key here would flash the whole class offline on
   * every transient disconnect.
   */
  async markInterrupted(
    academyId: string,
    classId: string,
    studentMembershipId: string,
    socketGeneration: string,
  ): Promise<PresenceEntry | null> {
    const redis = this.client();
    if (!redis) return null;
    const now = Date.now();
    try {
      const raw = await redis.eval(
        markInterruptedScript,
        1,
        presenceKey(academyId, classId, studentMembershipId),
        socketGeneration,
        now.toString(),
        presenceTtlMs.toString(),
      );
      // `null` means the key expired or a newer socket generation owns it. In
      // both cases there was no transition, so the gateway must emit no delta.
      if (typeof raw !== "string") return null;
      const stored = parse(raw);
      return stored ? toEntry(stored, now) : null;
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  async clear(
    academyId: string,
    classId: string,
    studentMembershipId: string,
  ): Promise<void> {
    const redis = this.client();
    if (!redis) return;
    try {
      await redis.del(
        presenceKey(academyId, classId, studentMembershipId),
      );
      await redis.srem(indexKey(academyId, classId), studentMembershipId);
      await redis.incr(versionKey(academyId, classId));
    } catch (error) {
      this.fail(error);
    }
  }

  /**
   * The authoritative current state of one class.
   *
   * Read straight from the keys that are still alive, so an entry whose TTL
   * lapsed is simply absent — there is no separate reaper to fall behind. The
   * index is repaired in the same pass.
   */
  async snapshot(
    academyId: string,
    classId: string,
  ): Promise<PresenceSnapshot | null> {
    const redis = this.client();
    if (!redis) return null;
    const now = Date.now();
    try {
      const members = await redis.smembers(indexKey(academyId, classId));
      const bounded = members.slice(0, monitoringLimits.rosterMaxEnrollments);
      const entries: PresenceEntry[] = [];
      const expired: string[] = [];

      if (bounded.length > 0) {
        const values = await redis.mget(
          ...bounded.map((id) => presenceKey(academyId, classId, id)),
        );
        bounded.forEach((membershipId, index) => {
          const raw = values[index];
          if (!raw) {
            expired.push(membershipId);
            return;
          }
          const stored = parse(raw);
          if (!stored) {
            expired.push(membershipId);
            return;
          }
          entries.push(toEntry(stored, now));
        });
      }
      if (expired.length > 0) {
        await redis.srem(indexKey(academyId, classId), ...expired);
      }

      const version = Number(
        (await redis.get(versionKey(academyId, classId))) ?? 0,
      );
      return {
        classId,
        version,
        entries,
        onlineCount: entries.filter((entry) => entry.state !== "OFFLINE").length,
        solvingCount: entries.filter((entry) => entry.state === "SOLVING").length,
        takenAt: new Date(now).toISOString(),
      };
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  /** The version a delta claims to produce, taken once per change. */
  async nextVersion(academyId: string, classId: string): Promise<number | null> {
    const redis = this.client();
    if (!redis) return null;
    try {
      return await redis.incr(versionKey(academyId, classId));
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  private async mutate(
    academyId: string,
    classId: string,
    studentMembershipId: string,
    change: (stored: StoredPresence, now: number) => StoredPresence,
  ): Promise<PresenceEntry | null> {
    const redis = this.client();
    if (!redis) return null;
    const now = Date.now();
    const stored = await this.read(redis, academyId, classId, studentMembershipId);
    // Nothing to attach a run or an interruption to: the connection already
    // expired, and reviving it here would resurrect a student who left.
    if (!stored) return null;
    return this.write(redis, academyId, change(stored, now), now);
  }

  private async read(
    redis: NonNullable<MonitoringRedis>,
    academyId: string,
    classId: string,
    studentMembershipId: string,
  ): Promise<StoredPresence | null> {
    try {
      const raw = await redis.get(
        presenceKey(academyId, classId, studentMembershipId),
      );
      return raw ? parse(raw) : null;
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  private async write(
    redis: NonNullable<MonitoringRedis>,
    academyId: string,
    stored: StoredPresence,
    now: number,
  ): Promise<PresenceEntry | null> {
    try {
      await redis.set(
        presenceKey(academyId, stored.classId, stored.studentMembershipId),
        JSON.stringify(stored),
        "PX",
        presenceTtlMs,
      );
      await redis.sadd(
        indexKey(academyId, stored.classId),
        stored.studentMembershipId,
      );
      return toEntry(stored, now);
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  private client(): NonNullable<MonitoringRedis> | null {
    return this.isAvailable ? this.redis : null;
  }

  /**
   * One failure latches the registry into degraded rather than retrying on
   * every keystroke. The gateway then refuses new realtime joins and says so,
   * which is the honest alternative to a roster that looks empty.
   */
  private fail(error: unknown): void {
    if (!this.degraded) {
      this.degraded = true;
      // Ids and reasons only: never a payload, a name, or a key value.
      this.logger.error(
        `monitoring presence degraded: ${
          error instanceof Error ? error.name : "unknown error"
        }`,
      );
    }
  }

  /** Lets a recovered connection lift the latch without a process restart. */
  recover(): void {
    this.degraded = false;
  }
}

function presenceKey(
  academyId: string,
  classId: string,
  membershipId: string,
): string {
  return `${monitoringKeyPrefix}presence:${academyId}:${classId}:${membershipId}`;
}

function indexKey(academyId: string, classId: string): string {
  return `${monitoringKeyPrefix}presence-index:${academyId}:${classId}`;
}

function versionKey(academyId: string, classId: string): string {
  return `${monitoringKeyPrefix}presence-version:${academyId}:${classId}`;
}

function parse(raw: string): StoredPresence | null {
  try {
    return JSON.parse(raw) as StoredPresence;
  } catch {
    return null;
  }
}

/**
 * The stored facts, reduced to the label the teacher sees. The reducer is the
 * shared one the client also holds, so both sides describe a student the same
 * way even while a delta is in flight.
 */
function toEntry(stored: StoredPresence, now: number): PresenceEntry {
  const state: MonitoringLiveState = resolveLiveState(
    {
      connection: stored.interruptedAt === null ? "CONNECTED" : "INTERRUPTED",
      interruptedAt: stored.interruptedAt,
      materialId: stored.materialId,
      visibility: stored.visibility,
      lastActivityAt: stored.lastActivityAt,
    },
    now,
  );
  return {
    studentMembershipId: stored.studentMembershipId,
    state,
    materialId: stored.materialId,
    courseId: stored.courseId,
    lastActivityAt: new Date(stored.lastActivityAt).toISOString(),
    stateExpiresAt:
      state === "RECONNECTING" && stored.interruptedAt !== null
        ? new Date(
            stored.interruptedAt + monitoringTiming.recoveryGraceMs,
          ).toISOString()
        : null,
    run: stored.run,
    latestSubmissionId: stored.latestSubmissionId,
  };
}
