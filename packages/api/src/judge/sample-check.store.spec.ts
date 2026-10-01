import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  SampleCheckStore,
  SAMPLE_TERMINAL_TTL_MS,
  type SampleCheckRecord,
} from "./sample-check.store.js";

/**
 * The store's Lua, against a real Redis.
 *
 * Every rule this file covers is a rule the scripts enforce *atomically*, and
 * no test double can show that: what matters is precisely that the steps
 * cannot be observed apart, or interrupted between. Opt-in, because it needs a
 * disposable Redis:
 *
 *   COVE_INTEGRATION_REDIS_URL=redis://127.0.0.1:6399 \
 *   npx vitest run src/judge/sample-check.store.spec.ts
 */
const redisUrl = process.env.COVE_INTEGRATION_REDIS_URL;

describe.skipIf(!redisUrl)("SampleCheckStore", () => {
  const client = new Redis(redisUrl!, { maxRetriesPerRequest: 1, lazyConnect: true });
  const store = new SampleCheckStore(async () => client);
  const limits = { academyOutstanding: 50, perMinute: 6 };

  const userId = "u-store-spec";
  const academyId = "a-store-spec";

  function record(overrides: Partial<SampleCheckRecord> = {}): SampleCheckRecord {
    const now = Date.now();
    return {
      checkId: randomUUID(),
      userId,
      academyId,
      classId: "k1",
      materialId: "m1",
      position: 1,
      exerciseRevision: 1,
      codeHash: "hash",
      requestHash: "request",
      clientRequestId: randomUUID(),
      status: "QUEUED",
      acceptedAt: now,
      dispatchedAt: null,
      finishedAt: null,
      lostAfter: now + 120_000,
      snapshot: {
        code: "print(1)",
        memoryLimitMb: 256,
        totalTimeLimitMs: 60_000,
        comparatorTimeLimitMs: 100,
        policy: {
          version: 1,
          semanticVersion: "elice-v1",
          runtime: { engine: "pyodide", engineVersion: "0.27.5" },
          comparator: {
            runtime: "pyodide-cpython",
            engineVersion: "0.27.5",
            budgetMs: 100,
          },
          ceilings: {
            totalTimeLimitMs: 60_000,
            caseTimeLimitMs: 3_000,
            memoryLimitMb: 256,
            outputBytes: 262_144,
          },
        },
        testCase: {
          input: "",
          expectedOutput: "1",
          comparator: "STDOUT",
          softTimeLimitMs: null,
          caseLimitMs: 3_000,
        },
      },
      result: null,
      failure: null,
      timings: { queueMs: null, executionMs: null, comparisonMs: null },
      ...overrides,
    };
  }

  /** Tokens left in the student's bucket, as the script would read them. */
  async function tokensLeft(): Promise<number> {
    const value = await client.hget(`cove:sample-check:rate:${userId}`, "tokens");
    return value === null ? limits.perMinute : Number(value);
  }

  beforeEach(async () => {
    if (client.status === "wait") await client.connect();
    const keys = await client.keys("cove:sample-check:*");
    if (keys.length > 0) await client.del(...keys);
  });

  afterAll(async () => {
    await client.quit().catch(() => undefined);
  });

  describe("admission", () => {
    it("charges one token for a check, and none for its replay", async () => {
      // The reported issue: deduplication and the token bucket were separate
      // round trips, so two retries of one click both found no request id yet
      // and both paid before either was recorded.
      const first = record();
      expect(await store.admit(first, limits)).toEqual({ kind: "accepted" });
      expect(await tokensLeft()).toBeCloseTo(limits.perMinute - 1, 1);

      const retry = record({ clientRequestId: first.clientRequestId });
      expect(await store.admit(retry, limits)).toEqual({
        kind: "duplicate",
        checkId: first.checkId,
      });
      // The replay cost nothing: the same balance as after the first check.
      expect(await tokensLeft()).toBeCloseTo(limits.perMinute - 1, 1);
    });

    it("charges one token when retries of one click arrive together", async () => {
      const clientRequestId = randomUUID();
      const admissions = await Promise.all([
        store.admit(record({ clientRequestId }), limits),
        store.admit(record({ clientRequestId }), limits),
        store.admit(record({ clientRequestId }), limits),
      ]);

      // One is accepted and the rest replay it — whichever reached Redis first.
      expect(admissions.filter((item) => item.kind === "accepted")).toHaveLength(1);
      expect(admissions.filter((item) => item.kind === "duplicate")).toHaveLength(2);
      expect(await tokensLeft()).toBeCloseTo(limits.perMinute - 1, 1);
    });

    it("refuses a student over their rate without starting a check", async () => {
      const accepted: SampleCheckRecord[] = [];
      for (let attempt = 0; attempt < limits.perMinute; attempt += 1) {
        const next = record();
        expect(await store.admit(next, limits)).toEqual({ kind: "accepted" });
        accepted.push(next);
        // Freed so the outstanding limit is not what refuses the next one.
        await store.finish(next, ["QUEUED"], { status: "COMPLETED", finishedAt: Date.now() });
      }

      const over = record();
      expect(await store.admit(over, limits)).toEqual({ kind: "rate-limited" });
      expect(await store.get(over.checkId)).toBeNull();
    });

    it("refuses a second outstanding check for the same student", async () => {
      const first = record();
      expect(await store.admit(first, limits)).toEqual({ kind: "accepted" });
      expect(await store.admit(record(), limits)).toEqual({ kind: "busy" });
    });

    it("refuses an academy at its limit", async () => {
      const one = { academyOutstanding: 1, perMinute: 6 };
      const first = record();
      expect(await store.admit(first, one)).toEqual({ kind: "accepted" });
      expect(await store.admit(record({ userId: "someone-else" }), one)).toEqual({
        kind: "academy-full",
      });
    });
  });

  describe("ending a check", () => {
    it("frees the student and the academy in the same call that ends it", async () => {
      // The reported issue: the terminal write and the marker cleanup were
      // separate operations, so a failure between them left the student
      // marked busy until the record expired — up to twenty minutes.
      const first = record();
      await store.admit(first, limits);

      const finished = await store.finish(first, ["QUEUED"], {
        status: "COMPLETED",
        finishedAt: Date.now(),
      });

      expect(finished?.status).toBe("COMPLETED");
      expect(await client.exists(`cove:sample-check:outstanding:user:${userId}`)).toBe(0);
      expect(
        await client.zscore(`cove:sample-check:outstanding:academy:${academyId}`, first.checkId),
      ).toBeNull();
      // And the student can start another one immediately.
      expect(await store.admit(record(), limits)).toEqual({ kind: "accepted" });
    });

    it("frees them on a terminal transition too", async () => {
      const first = record();
      await store.admit(first, limits);

      await store.transition(first, ["QUEUED"], {
        status: "UNAVAILABLE",
        failure: "ENQUEUE_FAILED",
        finishedAt: Date.now(),
      });

      expect(await client.exists(`cove:sample-check:outstanding:user:${userId}`)).toBe(0);
      expect(await store.admit(record(), limits)).toEqual({ kind: "accepted" });
    });

    it("keeps the markers while a check is still active", async () => {
      const first = record();
      await store.admit(first, limits);

      await store.transition(first, ["QUEUED"], { status: "RUNNING", dispatchedAt: Date.now() });

      expect(await client.exists(`cove:sample-check:outstanding:user:${userId}`)).toBe(1);
      expect(await store.admit(record(), limits)).toEqual({ kind: "busy" });
    });

    it("ends a stopping check as cancelled, keeping no verdict", async () => {
      const first = record();
      await store.admit(first, limits);
      await store.transition(first, ["QUEUED"], { status: "RUNNING" });
      await store.transition(first, ["RUNNING"], { status: "STOPPING" });

      const finished = await store.finish(first, ["RUNNING"], {
        status: "COMPLETED",
        finishedAt: Date.now(),
        result: {
          outcome: "PASSED",
          outputMatched: true,
          softLimitExceeded: false,
          stdout: "1",
          stdoutTruncated: false,
          stderr: "",
          stderrTruncated: false,
        },
      });

      expect(finished?.status).toBe("CANCELLED");
      expect(finished?.result).toBeNull();
      expect(await client.exists(`cove:sample-check:outstanding:user:${userId}`)).toBe(0);
    });

    it("shortens the record's life once it is terminal", async () => {
      const first = record();
      await store.admit(first, limits);
      await store.finish(first, ["QUEUED"], { status: "COMPLETED", finishedAt: Date.now() });

      const ttl = await client.pttl(`cove:sample-check:${first.checkId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(SAMPLE_TERMINAL_TTL_MS);
    });

    it("refuses to end a check that is already terminal", async () => {
      const first = record();
      await store.admit(first, limits);
      await store.finish(first, ["QUEUED"], { status: "COMPLETED", finishedAt: Date.now() });

      expect(await store.finish(first, ["QUEUED"], { status: "TIMED_OUT" })).toBeNull();
      expect((await store.get(first.checkId))?.status).toBe("COMPLETED");
    });
  });
});
