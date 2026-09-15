import { Inject, Injectable } from "@nestjs/common";
import {
  monitoringWatchLease,
  watchSummaryIndicator,
  type MonitoringWatchMode,
  type MonitoringWatchSummary,
} from "@cove/shared";

import {
  MONITORING_REDIS,
  monitoringKeyPrefix,
  type MonitoringRedis,
} from "./monitoring.tokens.js";

/**
 * Every watch that is open right now, across every API instance.
 *
 * The predecessor stored one visit id per teacher membership, which made a
 * second browser tab a *replacement* by construction: there was one slot, and
 * the newer watch took it. Five students in five tabs is the requirement now,
 * so the unit of storage is one lease per watch session rather than one per
 * teacher, and the indexes exist so a scope — a teacher, a class, a student,
 * a draft — can still be enumerated exactly when something has to be revoked.
 *
 * Three properties carry the whole design:
 *
 * - **Leases, not registrations.** A lease lives {@link monitoringWatchLease.ttlMs}
 *   and is renewed by the owning socket. An API that crashes holding fifty
 *   watches leaves fifty keys that lapse on their own, rather than fifty
 *   students told forever that somebody is reading over their shoulder.
 * - **Generations, not timestamps.** Every write names the visit *and* the
 *   generation it believes it owns, and the script refuses if the stored
 *   generation has moved on. A reconnect bumps the generation, so a command
 *   that was in flight when the transport dropped cannot land on its
 *   replacement — including when both visits name the same draft.
 * - **Indexes are caches of the leases, never the truth.** Membership of an
 *   index set is meaningless on its own; a member counts only while its lease
 *   key still exists. Every read prunes what it finds expired, which is what
 *   lets a crashed owner's entries disappear from a student's watcher count
 *   without anybody running a sweeper.
 *
 * Without Redis this fails closed. A teacher is refused rather than admitted
 * on a single node's word: a watcher count that only counts this process would
 * hand a student's document back to local drafting while another instance's
 * teacher was still typing into it.
 */

/** One open watch, as stored. */
export type WatchLease = {
  visitId: string;
  sessionId: string;
  generation: number;
  teacherMembershipId: string;
  academyId: string;
  classId: string;
  studentMembershipId: string;
  draftId: string;
  mode: MonitoringWatchMode;
};

export type WatchScope = {
  academyId?: string;
  classId?: string;
  teacherMembershipId?: string;
  studentMembershipId?: string;
  draftId?: string;
};

/**
 * Shared Lua preamble: read a lease, treating a missing key as absent.
 *
 * Kept as one string so every script agrees on what "live" means. A script
 * that decided for itself would eventually disagree, and the disagreement
 * would show up as a student whose indicator never clears.
 */
const readLease = `
local function lease(id)
  local raw = redis.call('GET', id)
  if not raw then return nil end
  return cjson.decode(raw)
end
`;

/**
 * Registering is a compare-and-set against the session's current generation.
 *
 * The session key is what makes a reconnect replace *its own* previous visit
 * and nothing else. A second tab has a different session id, so it writes a
 * different session key and displaces nobody.
 */
export const registerScript = `
${readLease}
local sessionKey = KEYS[1]
local leaseKey = KEYS[2]
local payload = ARGV[1]
local ttl = tonumber(ARGV[2])
local generation = tonumber(ARGV[3])
local previous = redis.call('GET', sessionKey)
local replaced = nil
if previous then
  local decoded = cjson.decode(previous)
  -- A start that is older than what this session already holds is a late
  -- retry of a superseded attempt, not a new watch. Refuse rather than
  -- silently rewinding the session to an earlier generation.
  if tonumber(decoded['generation']) >= generation then
    return cjson.encode({ ok = false })
  end
  replaced = decoded['visitId']
end
redis.call('SET', sessionKey, cjson.encode({ visitId = ARGV[4], generation = generation }), 'PX', ttl)
redis.call('SET', leaseKey, payload, 'PX', ttl)
for i = 5, #ARGV do
  redis.call('SADD', ARGV[i], ARGV[4])
  redis.call('PEXPIRE', ARGV[i], ttl * 4)
end
if replaced then
  return cjson.encode({ ok = true, replaced = replaced })
end
return cjson.encode({ ok = true })
`;

/** Renewal and mode changes both refuse a generation that has been superseded. */
export const renewScript = `
${readLease}
local current = lease(KEYS[1])
if not current then return 0 end
if tonumber(current['generation']) ~= tonumber(ARGV[1]) then return 0 end
local session = lease(KEYS[2])
if not session or session['visitId'] ~= current['visitId'] or tonumber(session['generation']) ~= tonumber(ARGV[1]) then return 0 end
if ARGV[3] ~= '' then current['mode'] = ARGV[3] end
local prefix = ARGV[4]
local indexes = {
  prefix .. 'watch-by-teacher:' .. current['teacherMembershipId'],
  prefix .. 'watch-by-class:' .. current['academyId'] .. ':' .. current['classId'],
  prefix .. 'watch-by-student:' .. current['academyId'] .. ':' .. current['studentMembershipId'],
  prefix .. 'watch-by-draft:' .. current['draftId'],
  prefix .. 'watch-by-academy:' .. current['academyId']
}
for _, key in ipairs(indexes) do
  redis.call('SADD', key, current['visitId'])
  redis.call('PEXPIRE', key, tonumber(ARGV[2]) * 4)
end
redis.call('SET', KEYS[1], cjson.encode(current), 'PX', tonumber(ARGV[2]))
redis.call('SET', KEYS[2], cjson.encode({ visitId = current['visitId'], generation = tonumber(ARGV[1]) }), 'PX', tonumber(ARGV[2]))
return 1
`;

/**
 * Ending removes the lease and its index entries, but only for the generation
 * that asked. An old socket's disconnect must not close the reconnect that
 * replaced it.
 */
export const endScript = `
${readLease}
local current = lease(KEYS[1])
if not current then return 0 end
if ARGV[1] ~= '' and tonumber(current['generation']) ~= tonumber(ARGV[1]) then
  return 0
end
redis.call('DEL', KEYS[1])
local sessionRaw = redis.call('GET', KEYS[2])
if sessionRaw then
  local session = cjson.decode(sessionRaw)
  if session['visitId'] == ARGV[2] then redis.call('DEL', KEYS[2]) end
end
for i = 3, #ARGV do
  redis.call('SREM', ARGV[i], ARGV[2])
end
return 1
`;

/**
 * Reading an index: return the live leases and prune the dead members.
 *
 * The prune is the point. Without it a crashed instance's visit ids would
 * accumulate in the student index and every watcher count would be wrong in
 * the one direction that matters — claiming somebody is watching when nobody
 * is.
 */
export const listScript = `
${readLease}
local members = redis.call('SMEMBERS', KEYS[1])
local live = {}
for _, visitId in ipairs(members) do
  local raw = redis.call('GET', ARGV[1] .. visitId)
  if raw then
    local current = cjson.decode(raw)
    local session = lease(ARGV[2] .. current['teacherMembershipId'] .. ':' .. current['sessionId'])
    if session and session['visitId'] == visitId and tonumber(session['generation']) == tonumber(current['generation']) then
      table.insert(live, raw)
    end
  else
    redis.call('SREM', KEYS[1], visitId)
  end
end
return live
`;

/** Snapshot and revision must be taken in the same Redis operation. */
export const summaryScript = `
${readLease}
local count = 0
local helping = 0
for _, id in ipairs(redis.call('SMEMBERS', KEYS[1])) do
  local current = lease(ARGV[1] .. id)
  if not current then
    redis.call('SREM', KEYS[1], id)
  else
    local session = lease(ARGV[2] .. current['teacherMembershipId'] .. ':' .. current['sessionId'])
    if session and session['visitId'] == id and tonumber(session['generation']) == tonumber(current['generation'])
      and (ARGV[3] == '' or current['classId'] == ARGV[3])
      and (ARGV[4] == '' or current['draftId'] == ARGV[4]) then
      count = count + 1
      if current['mode'] == 'HELPING' then helping = helping + 1 end
    end
  end
end
return {count, helping, redis.call('INCR', KEYS[2])}
`;

@Injectable()
export class WatchSessionRegistry {
  constructor(@Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis) {}

  /**
   * Whether cross-instance watch state can be trusted at all.
   *
   * Callers gate teacher access and editing on this rather than degrading
   * quietly: a single node's view of who is watching is not a smaller version
   * of the truth, it is a different claim.
   */
  get isAvailable(): boolean {
    return this.redis !== null;
  }

  /**
   * The next generation for one session, allocated by the server.
   *
   * A counter rather than a clock. Two API instances do not agree on the
   * millisecond, and a reconnect that landed on the slower of the two would
   * otherwise be issued a generation *below* the one it is replacing and be
   * refused as stale — the client would then be stuck retrying a watch it can
   * never open.
   */
  async nextGeneration(
    _teacherMembershipId: string,
    _sessionId: string,
  ): Promise<number> {
    const redis = this.require();
    const key = `${monitoringKeyPrefix}watch-generation`;
    const generation = await redis.incr(key);
    // Keep the fence monotonic even when a browser reconnects after a long sleep.
    return generation;
  }

  /**
   * Opens a lease for one watch session.
   *
   * Returns the visit this session previously held, when it had one, so its
   * audit row can be closed — that is a reconnect or a follow replacing its
   * own watch, never another tab's.
   */
  async register(lease: WatchLease): Promise<{
    ok: boolean;
    replacedVisitId: string | null;
  }> {
    const redis = this.require();
    const raw = await redis.eval(
      registerScript,
      2,
      this.sessionKey(lease.teacherMembershipId, lease.sessionId),
      this.leaseKey(lease.visitId),
      JSON.stringify(lease),
      monitoringWatchLease.ttlMs.toString(),
      lease.generation.toString(),
      lease.visitId,
      ...this.indexKeys(lease),
    );
    const result = parse<{ ok: boolean; replaced?: string }>(raw);
    if (!result?.ok) return { ok: false, replacedVisitId: null };
    return { ok: true, replacedVisitId: result.replaced ?? null };
  }

  /**
   * Extends a lease, and optionally records a mode change in the same write.
   *
   * False means this generation no longer owns the session — the caller's
   * watch has been superseded or has expired, and it must stop acting as
   * though it were authorized.
   */
  async renew(
    lease: Pick<WatchLease, "visitId" | "generation" | "teacherMembershipId" | "sessionId">,
    mode?: MonitoringWatchMode,
  ): Promise<boolean> {
    if (!this.redis) return false;
    const result = await this.redis.eval(
      renewScript,
      2,
      this.leaseKey(lease.visitId),
      this.sessionKey(lease.teacherMembershipId, lease.sessionId),
      lease.generation.toString(),
      monitoringWatchLease.ttlMs.toString(),
      mode ?? "",
      monitoringKeyPrefix,
    );
    return result === 1;
  }

  /** The current lease, or null when it has expired or never existed. */
  async read(visitId: string): Promise<WatchLease | null> {
    if (!this.redis) return null;
    return parse<WatchLease>(await this.redis.get(this.leaseKey(visitId)));
  }

  /**
   * Whether this exact watch may still act.
   *
   * Identity is all three values together. Matching the visit alone would let
   * a command issued before a reconnect operate on the session that replaced
   * it, which is the same draft and a different authorization.
   */
  async isCurrent(identity: {
    visitId: string;
    generation: number;
    sessionId: string;
  }): Promise<WatchLease | null> {
    const lease = await this.read(identity.visitId);
    if (!lease) return null;
    if (lease.generation !== identity.generation) return null;
    if (lease.sessionId !== identity.sessionId) return null;
    const session = parse<{ visitId: string; generation: number }>(
      await this.redis!.get(this.sessionKey(lease.teacherMembershipId, lease.sessionId)),
    );
    if (session?.visitId !== lease.visitId || session.generation !== lease.generation) return null;
    return lease;
  }

  /** Closes one lease, only if the naming generation still owns it. */
  async end(
    lease: Pick<
      WatchLease,
      | "visitId"
      | "teacherMembershipId"
      | "sessionId"
      | "academyId"
      | "classId"
      | "studentMembershipId"
      | "draftId"
    > & { generation?: number },
  ): Promise<boolean> {
    if (!this.redis) return false;
    const result = await this.redis.eval(
      endScript,
      2,
      this.leaseKey(lease.visitId),
      this.sessionKey(lease.teacherMembershipId, lease.sessionId),
      lease.generation === undefined ? "" : lease.generation.toString(),
      lease.visitId,
      ...this.indexKeys(lease),
    );
    return result === 1;
  }

  /**
   * Closes a lease known only by its visit id.
   *
   * Revocation works from audit rows, which carry a visit but not the session
   * that opened it — so the lease is read first and then ended by its own
   * recorded identity. A lease that has already lapsed is not an error: the
   * outcome revocation wants is "this watch is not open", and it is not.
   */
  async endByVisitId(visitId: string): Promise<WatchLease | null> {
    const lease = await this.read(visitId);
    if (!lease) return null;
    await this.end(lease);
    return lease;
  }

  /** Every live lease in a scope, with expired index members pruned away. */
  async list(scope: WatchScope): Promise<WatchLease[]> {
    if (!this.redis) return [];
    const key = this.scopeIndexKey(scope);
    if (!key) return [];
    const raw = (await this.redis.eval(
      listScript,
      1,
      key,
      `${monitoringKeyPrefix}watch:`,
      `${monitoringKeyPrefix}watch-session:`,
    )) as unknown[];
    const leases = raw
      .map((entry) => parse<WatchLease>(typeof entry === "string" ? entry : null))
      .filter((entry): entry is WatchLease => entry !== null);
    // The index is chosen for the narrowest available term; anything else in
    // the scope is applied here rather than by maintaining an index per
    // combination of fields nobody queries together.
    return leases.filter(
      (lease) =>
        (!scope.academyId || lease.academyId === scope.academyId) &&
        (!scope.classId || lease.classId === scope.classId) &&
        (!scope.teacherMembershipId ||
          lease.teacherMembershipId === scope.teacherMembershipId) &&
        (!scope.studentMembershipId ||
          lease.studentMembershipId === scope.studentMembershipId) &&
        (!scope.draftId || lease.draftId === scope.draftId),
    );
  }

  /**
   * What one student's exercise currently adds up to.
   *
   * The revision is a per-scope counter rather than a clock: two API instances
   * do not share a millisecond, and a summary that lost a race on the wire
   * must still be identifiable as the older one when it arrives.
   */
  async summarize(scope: {
    academyId: string;
    /** Null asks about the student across every class they are watched from. */
    classId: string | null;
    studentMembershipId: string;
    draftId: string | null;
  }): Promise<MonitoringWatchSummary> {
    const redis = this.require();
    const raw = await redis.eval(
      summaryScript, 2,
      `${monitoringKeyPrefix}watch-by-student:${scope.academyId}:${scope.studentMembershipId}`,
      `${monitoringKeyPrefix}watch-rev:${scope.academyId}:${scope.studentMembershipId}`,
      `${monitoringKeyPrefix}watch:`, `${monitoringKeyPrefix}watch-session:`,
      scope.classId ?? "", scope.draftId ?? "",
    ) as [number, number, number];
    const [watcherCount, helpingCount, revision] = raw;
    return { ...scope, revision, watcherCount, helpingCount,
      indicator: watchSummaryIndicator({ watcherCount, helpingCount }) };
  }

  /**
   * How many live watches one draft has, across every instance.
   *
   * The document service's own set is process-local and answers a different
   * question — which visits *this* API is serving. Handing a draft back to the
   * student is a global decision and must be taken from this.
   */
  async watcherCount(draftId: string): Promise<number> {
    return (await this.list({ draftId })).length;
  }

  private require(): NonNullable<MonitoringRedis> {
    if (!this.redis) throw new Error("monitoring Redis unavailable");
    return this.redis;
  }

  private leaseKey(visitId: string): string {
    return `${monitoringKeyPrefix}watch:${visitId}`;
  }

  private sessionKey(teacherMembershipId: string, sessionId: string): string {
    return `${monitoringKeyPrefix}watch-session:${teacherMembershipId}:${sessionId}`;
  }

  /**
   * The index sets one lease belongs to.
   *
   * Written on register and removed on end, together, so an index can only
   * ever be stale in the direction the read path already prunes.
   */
  private indexKeys(
    lease: Pick<
      WatchLease,
      "academyId" | "classId" | "teacherMembershipId" | "studentMembershipId" | "draftId"
    >,
  ): string[] {
    return [
      `${monitoringKeyPrefix}watch-by-teacher:${lease.teacherMembershipId}`,
      `${monitoringKeyPrefix}watch-by-class:${lease.academyId}:${lease.classId}`,
      `${monitoringKeyPrefix}watch-by-student:${lease.academyId}:${lease.studentMembershipId}`,
      `${monitoringKeyPrefix}watch-by-draft:${lease.draftId}`,
      `${monitoringKeyPrefix}watch-by-academy:${lease.academyId}`,
    ];
  }

  /** The narrowest index that covers a scope; the rest is filtered in memory. */
  private scopeIndexKey(scope: WatchScope): string | null {
    if (scope.draftId) {
      return `${monitoringKeyPrefix}watch-by-draft:${scope.draftId}`;
    }
    if (scope.studentMembershipId && scope.academyId) {
      return `${monitoringKeyPrefix}watch-by-student:${scope.academyId}:${scope.studentMembershipId}`;
    }
    if (scope.teacherMembershipId) {
      return `${monitoringKeyPrefix}watch-by-teacher:${scope.teacherMembershipId}`;
    }
    if (scope.classId && scope.academyId) {
      return `${monitoringKeyPrefix}watch-by-class:${scope.academyId}:${scope.classId}`;
    }
    if (scope.academyId) {
      return `${monitoringKeyPrefix}watch-by-academy:${scope.academyId}`;
    }
    return null;
  }
}

function parse<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
