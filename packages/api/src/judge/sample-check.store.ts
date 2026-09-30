import type { SampleCheckOutcome, SampleCheckStatus } from "@cove/shared";
import type { Redis } from "ioredis";

import type { EnhancedCase } from "./case-evaluator.js";
import type { GradingPolicySnapshot } from "./grading-profile.js";

/**
 * Where public sample checks live while they exist: Redis, and nowhere else.
 *
 * Deliberately not the database. A check is practice — it must never become a
 * submission, an attempt or a history row — and it is worth nothing after the
 * student has read it. Records expire on their own: an active one after
 * `ACTIVE_TTL_MS` whatever happens to its job, a finished one
 * `TERMINAL_TTL_MS` after it finished. A read after that is `EXPIRED`.
 *
 * Every state change is one Lua script, so admission, a cancel and a worker
 * finishing can race without any of them seeing a half-written record.
 */

/** Active records outlive any legitimate run: 10 s queue plus a 5 min total. */
export const SAMPLE_ACTIVE_TTL_MS = 20 * 60_000;
export const SAMPLE_TERMINAL_TTL_MS = 15 * 60_000;

/**
 * Everything the worker needs, frozen at acceptance: only the selected public
 * case, never the rest of the exercise. The job never reads the exercise, so
 * an edit made after acceptance cannot change a check already running.
 */
export type SampleSnapshot = {
  code: string;
  memoryLimitMb: number;
  totalTimeLimitMs: number;
  comparatorTimeLimitMs: number;
  policy: GradingPolicySnapshot;
  testCase: EnhancedCase;
};

export type StoredSampleResult = {
  outcome: SampleCheckOutcome;
  outputMatched: boolean | null;
  softLimitExceeded: boolean;
  stdout: string;
  stdoutTruncated: boolean;
  stderr: string;
  stderrTruncated: boolean;
};

export type SampleCheckRecord = {
  checkId: string;
  userId: string;
  academyId: string;
  classId: string;
  materialId: string;
  position: number;
  exerciseRevision: number;
  codeHash: string;
  /** What this request asked for; a reused request id must ask the same. */
  requestHash: string;
  clientRequestId: string;
  status: SampleCheckStatus;
  acceptedAt: number;
  dispatchedAt: number | null;
  finishedAt: number | null;
  /** Past this, an active record's job is presumed lost. */
  lostAfter: number;
  snapshot: SampleSnapshot;
  result: StoredSampleResult | null;
  /** Internal reason for a non-verdict ending. Never shown verbatim. */
  failure: string | null;
  timings: {
    queueMs: number | null;
    executionMs: number | null;
    comparisonMs: number | null;
  };
};

export type AdmissionLimits = {
  /** Outstanding checks allowed across the academy. */
  academyOutstanding: number;
  /** New checks a student may start per minute. A replay costs nothing. */
  perMinute: number;
};

export type Admission =
  | { kind: "accepted" }
  | { kind: "duplicate"; checkId: string }
  | { kind: "rate-limited" }
  | { kind: "busy" }
  | { kind: "academy-full" };

const key = {
  record: (checkId: string) => `cove:sample-check:${checkId}`,
  dedupe: (userId: string, clientRequestId: string) =>
    `cove:sample-check:request:${userId}:${clientRequestId}`,
  user: (userId: string) => `cove:sample-check:outstanding:user:${userId}`,
  academy: (academyId: string) => `cove:sample-check:outstanding:academy:${academyId}`,
  rate: (userId: string) => `cove:sample-check:rate:${userId}`,
};

/**
 * Admission, in one step: the request id is new, the student is under their
 * rate, has nothing outstanding, and the academy is under its limit — then the
 * record, the request id and both outstanding markers are written together.
 *
 * The rate check lives here, after the request id has been looked up, because
 * the two cannot be separate round trips. Two retries of one click reach Redis
 * together, both find no request id yet, and both spend a token before either
 * writes one — so a student loses a second token for a check they never
 * started. Inside the script the first retry writes the request id and the
 * second reads it, and only genuinely new work is ever charged.
 */
const ADMIT_SCRIPT = `
local existing = redis.call('GET', KEYS[1])
if existing then return {'duplicate', existing} end
local capacity = tonumber(ARGV[6])
local window_ms = tonumber(ARGV[7])
local now_ms = tonumber(ARGV[4])
local bucket = redis.call('HMGET', KEYS[5], 'tokens', 'updated_at')
local tokens = tonumber(bucket[1]) or capacity
local updated_at = tonumber(bucket[2]) or now_ms
tokens = math.min(capacity, tokens + math.max(0, now_ms - updated_at) * capacity / window_ms)
if tokens < 1 then
  redis.call('HSET', KEYS[5], 'tokens', tokens, 'updated_at', now_ms)
  redis.call('PEXPIRE', KEYS[5], window_ms)
  return {'rate-limited', ''}
end
if redis.call('EXISTS', KEYS[2]) == 1 then return {'busy', ''} end
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[4])
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[5]) then return {'academy-full', ''} end
redis.call('HSET', KEYS[5], 'tokens', tokens - 1, 'updated_at', now_ms)
redis.call('PEXPIRE', KEYS[5], window_ms)
redis.call('SET', KEYS[4], ARGV[2], 'PX', ARGV[3])
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[3])
redis.call('ZADD', KEYS[3], tonumber(ARGV[4]) + tonumber(ARGV[3]), ARGV[1])
redis.call('PEXPIRE', KEYS[3], ARGV[3])
return {'accepted', ARGV[1]}
`;

/**
 * Freeing what a check held, as the tail of whatever made it terminal.
 *
 * Never its own round trip: a check written terminal in one call and released
 * in the next leaves the student marked busy for the whole active TTL if
 * anything fails in between — twenty minutes of being unable to start another
 * check, for work that has already finished.
 */
const RELEASE_TAIL = `
if redis.call('GET', KEYS[2]) == ARGV[5] then redis.call('DEL', KEYS[2]) end
redis.call('ZREM', KEYS[3], ARGV[5])
redis.call('PEXPIRE', KEYS[4], ARGV[3])
`;

/**
 * Compare-and-set on the status: the patch applies only from an allowed
 * status, so a cancel and a finishing worker cannot overwrite each other.
 * Returns the updated record, or nil when missing or not allowed.
 */
const TRANSITION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local record = cjson.decode(raw)
local allowed = cjson.decode(ARGV[1])
local ok = false
for _, status in ipairs(allowed) do
  if record['status'] == status then ok = true end
end
if not ok then return nil end
local patch = cjson.decode(ARGV[2])
for field, value in pairs(patch) do record[field] = value end
local encoded = cjson.encode(record)
redis.call('SET', KEYS[1], encoded, 'PX', ARGV[3])
if ARGV[4] == '1' then
${RELEASE_TAIL}
end
return encoded
`;

/**
 * Ending a check, in one decision.
 *
 * A worker that has concluded and an owner who has asked to stop are always
 * racing: the worker cannot read the status and then write a verdict, because
 * the cancel can land between the two and leave the record in `STOPPING` with
 * nobody left to move it. So the choice is made here, against the status as it
 * is at this instant — `STOPPING` becomes `CANCELLED` and the verdict is
 * dropped; anything in `from` takes the verdict — and either way the record
 * comes back terminal.
 */
const FINISH_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local record = cjson.decode(raw)
local patch
if record['status'] == 'STOPPING' then
  patch = cjson.decode(ARGV[4])
else
  local ok = false
  for _, status in ipairs(cjson.decode(ARGV[1])) do
    if record['status'] == status then ok = true end
  end
  if not ok then return nil end
  patch = cjson.decode(ARGV[2])
end
for field, value in pairs(patch) do record[field] = value end
local encoded = cjson.encode(record)
redis.call('SET', KEYS[1], encoded, 'PX', ARGV[3])
${RELEASE_TAIL}
return encoded
`;

/** The rate window the per-minute limit is spent over. */
const RATE_WINDOW_MS = 60_000;

export const terminalSampleStatuses: SampleCheckStatus[] = [
  "COMPLETED",
  "UNAVAILABLE",
  "TIMED_OUT",
  "CANCELLED",
];

export class SampleCheckStore {
  constructor(private readonly client: () => Promise<Redis>) {}

  /**
   * Deduplication, the student's rate, their outstanding check and the
   * academy's limit — decided and written in one call, so concurrent retries
   * of one click cannot each be charged before either is recorded.
   */
  async admit(record: SampleCheckRecord, limits: AdmissionLimits): Promise<Admission> {
    const [kind, value] = (await (await this.client()).eval(
      ADMIT_SCRIPT,
      5,
      key.dedupe(record.userId, record.clientRequestId),
      key.user(record.userId),
      key.academy(record.academyId),
      key.record(record.checkId),
      key.rate(record.userId),
      record.checkId,
      JSON.stringify(record),
      String(SAMPLE_ACTIVE_TTL_MS),
      String(Date.now()),
      String(limits.academyOutstanding),
      String(limits.perMinute),
      String(RATE_WINDOW_MS),
    )) as [string, string];
    if (kind === "duplicate") return { kind, checkId: value };
    if (kind === "rate-limited" || kind === "busy" || kind === "academy-full") {
      return { kind };
    }
    return { kind: "accepted" };
  }

  async get(checkId: string): Promise<SampleCheckRecord | null> {
    const raw = await (await this.client()).get(key.record(checkId));
    return raw ? (JSON.parse(raw) as SampleCheckRecord) : null;
  }

  /**
   * Moves a record on, but only from `from`. A terminal patch shortens its
   * life to `SAMPLE_TERMINAL_TTL_MS` and frees its outstanding markers in the
   * same call: a check written terminal here can never be left holding the
   * student's slot by a failure on the way to a second one.
   */
  async transition(
    record: SampleCheckRecord,
    from: SampleCheckStatus[],
    patch: Partial<SampleCheckRecord>,
  ): Promise<SampleCheckRecord | null> {
    const terminal =
      patch.status !== undefined && terminalSampleStatuses.includes(patch.status);
    const raw = (await (await this.client()).eval(
      TRANSITION_SCRIPT,
      4,
      ...this.recordKeys(record),
      JSON.stringify(from),
      JSON.stringify(patch),
      String(terminal ? SAMPLE_TERMINAL_TTL_MS : SAMPLE_ACTIVE_TTL_MS),
      terminal ? "1" : "0",
      record.checkId,
    )) as string | null;
    return raw ? (JSON.parse(raw) as SampleCheckRecord) : null;
  }

  /**
   * Ends a check: `CANCELLED` if its owner has asked it to stop, else `patch`
   * from one of `from`. One Redis call, so a cancel cannot arrive between
   * reading the status and writing the ending and leave the check in
   * `STOPPING`, and so the markers it held are freed with the ending rather
   * than after it. Returns the terminal record, or null if it was already
   * terminal or gone.
   */
  async finish(
    record: SampleCheckRecord,
    from: SampleCheckStatus[],
    patch: Partial<SampleCheckRecord>,
  ): Promise<SampleCheckRecord | null> {
    const raw = (await (await this.client()).eval(
      FINISH_SCRIPT,
      4,
      ...this.recordKeys(record),
      JSON.stringify(from),
      JSON.stringify(patch),
      String(SAMPLE_TERMINAL_TTL_MS),
      // A stopped check keeps no verdict: only that it stopped, and when.
      JSON.stringify({ status: "CANCELLED", finishedAt: patch.finishedAt ?? Date.now() }),
      record.checkId,
    )) as string | null;
    return raw ? (JSON.parse(raw) as SampleCheckRecord) : null;
  }

  /** The record and the three markers it holds, in the order the scripts use. */
  private recordKeys(record: SampleCheckRecord): [string, string, string, string] {
    return [
      key.record(record.checkId),
      key.user(record.userId),
      key.academy(record.academyId),
      key.dedupe(record.userId, record.clientRequestId),
    ];
  }
}
