import { describe, expect, it, vi } from "vitest";

import type { ComparisonResult, OutputComparator } from "./comparator-pool.js";
import { ExecutionCapacity } from "./execution-capacity.js";
import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { SampleCheckRunner } from "./sample-check.runner.js";
import type {
  SampleCheckRecord,
  SampleCheckStore,
} from "./sample-check.store.js";

/** The store's contract, in memory: compare-and-set on status. */
class MemoryStore {
  records = new Map<string, SampleCheckRecord>();

  async get(checkId: string) {
    const record = this.records.get(checkId);
    return record ? structuredClone(record) : null;
  }

  async transition(
    of: SampleCheckRecord,
    from: SampleCheckRecord["status"][],
    patch: Partial<SampleCheckRecord>,
  ) {
    const record = this.records.get(of.checkId);
    if (!record || !from.includes(record.status)) return null;
    Object.assign(record, patch);
    return structuredClone(record);
  }

  /** One decision, as the Lua script makes it: stopping wins, else `from`. */
  async finish(
    of: SampleCheckRecord,
    from: SampleCheckRecord["status"][],
    patch: Partial<SampleCheckRecord>,
  ) {
    const record = this.records.get(of.checkId);
    if (!record) return null;
    if (record.status === "STOPPING") {
      Object.assign(record, { status: "CANCELLED", finishedAt: patch.finishedAt ?? Date.now() });
      return structuredClone(record);
    }
    if (!from.includes(record.status)) return null;
    Object.assign(record, patch);
    return structuredClone(record);
  }
}

const policy = {
  version: 1 as const,
  semanticVersion: "elice-v1",
  runtime: { engine: "pyodide" as const, engineVersion: "0.27.5" },
  comparator: { runtime: "pyodide-cpython" as const, engineVersion: "0.27.5", budgetMs: 100 },
  ceilings: { totalTimeLimitMs: 60_000, caseTimeLimitMs: 3_000, memoryLimitMb: 256, outputBytes: 262_144 },
};

function record(overrides: Partial<SampleCheckRecord> = {}): SampleCheckRecord {
  return {
    checkId: "c0000000-0000-4000-8000-000000000001",
    userId: "u1",
    academyId: "a1",
    classId: "k1",
    materialId: "m1",
    position: 1,
    exerciseRevision: 1,
    codeHash: "hash",
    requestHash: "request",
    clientRequestId: "r1",
    status: "QUEUED",
    acceptedAt: Date.now(),
    dispatchedAt: null,
    finishedAt: null,
    lostAfter: Date.now() + 120_000,
    snapshot: {
      code: "print(input())",
      memoryLimitMb: 256,
      totalTimeLimitMs: 60_000,
      comparatorTimeLimitMs: 100,
      policy,
      testCase: {
        input: "hello\n",
        expectedOutput: "hello",
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

function setup(options: {
  record?: Partial<SampleCheckRecord>;
  run?: () => Promise<ExecutionResult>;
  compare?: ComparisonResult;
  engineVersion?: string;
  capacity?: ExecutionCapacity;
} = {}) {
  const store = new MemoryStore();
  const initial = record(options.record);
  store.records.set(initial.checkId, initial);
  const engine = {
    version: options.engineVersion ?? "pyodide-0.27.5",
    run: vi.fn(
      options.run ??
        (async () => ({ stdout: "hello\n", stderr: "", outcome: "PASSED" as const, runtimeMs: 12 })),
    ),
    dispose: vi.fn(),
  } as unknown as ExecutionEngine;
  const comparator = {
    version: "pyodide-0.27.5",
    compare: vi.fn(async () => options.compare ?? ({ kind: "match" } as const)),
  } satisfies OutputComparator;
  const runner = new SampleCheckRunner(
    store as unknown as SampleCheckStore,
    engine,
    comparator,
    options.capacity ?? new ExecutionCapacity(2),
  );
  return { store, engine, comparator, runner, checkId: initial.checkId };
}

describe("SampleCheckRunner", () => {
  it("judges the one public case with the shared evaluator", async () => {
    const { runner, store, engine, comparator, checkId } = setup();

    await runner.run(checkId);

    const done = store.records.get(checkId)!;
    expect(done.status).toBe("COMPLETED");
    expect(done.result).toEqual(
      expect.objectContaining({
        outcome: "PASSED",
        outputMatched: true,
        softLimitExceeded: false,
        stdout: "hello\n",
      }),
    );
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({ code: "print(input())", stdin: "hello\n" }),
    );
    expect(comparator.compare).toHaveBeenCalledWith(
      expect.objectContaining({ comparator: "STDOUT", deadlineAt: expect.any(Number) }),
    );
    expect(done.timings.queueMs).not.toBeNull();
  });

  it("reports a mismatch as a completed check, with the output as printed", async () => {
    const { runner, store, checkId } = setup({
      run: async () => ({ stdout: "  goodbye  \n", stderr: "", outcome: "PASSED", runtimeMs: 5 }),
      compare: { kind: "no-match" },
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!.result).toEqual(
      expect.objectContaining({ outcome: "WRONG_OUTPUT", outputMatched: false, stdout: "  goodbye  \n" }),
    );
  });

  it("marks a slow correct answer as a warning, not a plain pass", async () => {
    const { runner, store, checkId } = setup({
      record: {
        snapshot: {
          ...record().snapshot,
          testCase: { ...record().snapshot.testCase, softTimeLimitMs: 10 },
        },
      },
      run: async () => ({ stdout: "hello\n", stderr: "", outcome: "PASSED", runtimeMs: 50 }),
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!.result).toEqual(
      expect.objectContaining({ outcome: "PASSED_WITH_WARNING", softLimitExceeded: true }),
    );
  });

  it("runs no student code on a runtime the check was not recorded against", async () => {
    const { runner, store, engine, checkId } = setup({ engineVersion: "pyodide-0.28.0" });

    await runner.run(checkId);

    expect(engine.run).not.toHaveBeenCalled();
    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "UNAVAILABLE", failure: "RUNTIME_VERSION_MISMATCH", result: null }),
    );
  });

  it("treats an invalid pattern as uncheckable, never as a wrong answer", async () => {
    const { runner, store, checkId } = setup({
      compare: { kind: "invalid-pattern", detail: "unterminated" },
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "UNAVAILABLE", failure: "COMPARATOR_INVALID_PATTERN", result: null }),
    );
  });

  it("times out a check that waited too long in the queue, without running it", async () => {
    const { runner, store, engine, checkId } = setup({
      record: { acceptedAt: Date.now() - 11_000 },
    });

    await runner.run(checkId);

    expect(engine.run).not.toHaveBeenCalled();
    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "TIMED_OUT", failure: "QUEUE_WAIT" }),
    );
  });

  it("times out a check that could not get an execution slot in time", async () => {
    const capacity = new ExecutionCapacity(2);
    const held = await capacity.tryBackground(Date.now() + 5_000);
    const { runner, store, engine, checkId } = setup({
      capacity,
      record: { acceptedAt: Date.now() - 9_950 },
    });

    await runner.run(checkId);

    expect(engine.run).not.toHaveBeenCalled();
    expect(store.records.get(checkId)!.status).toBe("TIMED_OUT");
    held!();
  });

  it("does not run a check cancelled while it waited", async () => {
    const { runner, store, engine, checkId } = setup({ record: { status: "CANCELLED" } });

    await runner.run(checkId);

    expect(engine.run).not.toHaveBeenCalled();
    expect(store.records.get(checkId)!.status).toBe("CANCELLED");
  });

  it("ends a check stopped mid-run as cancelled, discarding its result, and holds the slot until then", async () => {
    const capacity = new ExecutionCapacity(2);
    const { runner, store, checkId } = setup({
      capacity,
      run: async () => {
        // The owner presses Stop while the program is still running.
        store.records.get(checkId)!.status = "STOPPING";
        expect(capacity.stats().background).toBe(1);
        return { stdout: "hello\n", stderr: "", outcome: "PASSED", runtimeMs: 5 };
      },
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "CANCELLED", result: null }),
    );
    expect(capacity.stats().background).toBe(0);
  });

  it("never accepts a verdict after the deadline", async () => {
    const { runner, store, checkId } = setup({
      record: {
        snapshot: { ...record().snapshot, totalTimeLimitMs: 50 },
      },
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { stdout: "hello\n", stderr: "", outcome: "PASSED", runtimeMs: 5 };
      },
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "TIMED_OUT", failure: "DEADLINE", result: null }),
    );
  });

  it("records an engine failure as ours", async () => {
    const { runner, store, checkId } = setup({
      run: async () => {
        throw new Error("sandbox did not answer in time");
      },
    });

    await runner.run(checkId);

    expect(store.records.get(checkId)!).toEqual(
      expect.objectContaining({ status: "UNAVAILABLE", failure: "ENGINE_FAILURE" }),
    );
  });

  it("caps displayed output and says so", async () => {
    const { runner, store, checkId } = setup({
      run: async () => ({ stdout: "x".repeat(20_000), stderr: "", outcome: "PASSED", runtimeMs: 5 }),
    });

    await runner.run(checkId);

    const result = store.records.get(checkId)!.result!;
    expect(result.stdout).toHaveLength(16_000);
    expect(result.stdoutTruncated).toBe(true);
  });

  describe("reported issues", () => {
    it("holds its execution slot until the engine has actually finished", async () => {
      // Issue 1: the evaluator gave up at its timer and the slot was released
      // while the engine request — here still waiting for a runner — went on
      // to run later, invisible to the capacity gate.
      const capacity = new ExecutionCapacity(2);
      let engineSettled = false;
      const { runner, store, checkId } = setup({
        capacity,
        record: { snapshot: { ...record().snapshot, totalTimeLimitMs: 50 } },
        run: () =>
          new Promise((resolve) =>
            setTimeout(() => {
              engineSettled = true;
              resolve({ stdout: "", stderr: "", outcome: "TIME_LIMIT", runtimeMs: 50 });
            }, 2_800),
          ),
      });

      await runner.run(checkId);

      expect(store.records.get(checkId)!.status).toBe("TIMED_OUT");
      expect(engineSettled).toBe(true);
      expect(capacity.stats().background).toBe(0);
    }, 10_000);

    it("still waits for the engine when the store cannot record the timeout", async () => {
      // Issue 3: the cleanup wait sat after the write, so a Redis failure on
      // the timeout path skipped it and freed the slot with the program still
      // running — the very case the wait exists for.
      const capacity = new ExecutionCapacity(2);
      let engineSettled = false;
      const { runner, store, checkId } = setup({
        capacity,
        record: { snapshot: { ...record().snapshot, totalTimeLimitMs: 50 } },
        run: () =>
          new Promise((resolve) =>
            setTimeout(() => {
              engineSettled = true;
              resolve({ stdout: "", stderr: "", outcome: "TIME_LIMIT", runtimeMs: 50 });
            }, 2_800),
          ),
      });
      const realFinish = store.finish.bind(store);
      store.finish = async (...args: Parameters<typeof realFinish>) => {
        await realFinish(...args);
        throw new Error("redis unavailable");
      };

      await expect(runner.run(checkId)).rejects.toThrow("redis unavailable");

      expect(engineSettled).toBe(true);
      expect(capacity.stats().background).toBe(0);
    }, 10_000);

    it("never leaves a check stopping when the cancel lands mid-finish", async () => {
      // Issue 2: finishing took two separate transitions; a cancel between
      // them made both miss, and the check sat in STOPPING — blocking the
      // student's next check — until the lost-check recovery.
      const { runner, store, checkId } = setup();
      const realTransition = store.transition.bind(store);
      const racing = store as unknown as {
        transition: typeof store.transition;
        finish?: (...args: unknown[]) => Promise<unknown>;
      };
      let writes = 0;
      const cancelArrives = () => {
        // The API's cancel: RUNNING → STOPPING, and nothing else.
        const current = store.records.get(checkId)!;
        if (current.status === "RUNNING") current.status = "STOPPING";
      };
      racing.transition = async (...args) => {
        const result = await realTransition(...args);
        // After the dispatch write, the next write is the finish.
        if (++writes === 2) cancelArrives();
        return result;
      };
      if (racing.finish) {
        const realFinish = racing.finish.bind(store);
        racing.finish = async (...args: unknown[]) => {
          const result = await realFinish(...args);
          cancelArrives();
          return result;
        };
      }

      await runner.run(checkId);

      expect(["COMPLETED", "CANCELLED"]).toContain(store.records.get(checkId)!.status);
    });
  });
});

