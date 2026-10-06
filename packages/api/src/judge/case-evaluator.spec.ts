import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateEnhancedCase } from "./case-evaluator.js";
import type { ExecutionResult } from "./execution-engine.js";

const passed: ExecutionResult = {
  outcome: "PASSED", stdout: "42", stderr: "", runtimeMs: 100,
};

function fixture(delayMs: number, result = passed) {
  vi.useFakeTimers();
  const engine = {
    version: "pyodide-0.27.5",
    dispose: vi.fn(async () => {}),
    run: vi.fn(() => new Promise<ExecutionResult>((resolve) => {
      setTimeout(() => resolve(result), delayMs);
    })),
  };
  const comparator = {
    version: "pyodide-0.27.5",
    compare: vi.fn(async () => ({ kind: "match" as const })),
  };
  const input = {
    code: "print(42)",
    memoryLimitMb: 256,
    comparatorTimeLimitMs: 100,
    deadlineAt: Date.now() + 65_000,
    testCase: {
      input: "", expectedOutput: "42", comparator: "STDOUT" as const,
      softTimeLimitMs: null, caseLimitMs: 3_000,
    },
  };
  return { engine, comparator, input };
}

afterEach(() => vi.useRealTimers());

describe("enhanced case execution deadlines", () => {
  it("never accepts truncated output even when its captured prefix matches", async () => {
    const {engine, comparator, input} = fixture(100, {...passed, outputTruncated: true});
    const evaluation = evaluateEnhancedCase({engine, comparator}, input);
    await vi.advanceTimersByTimeAsync(100);
    expect(await evaluation).toMatchObject({kind: "verdict", outcome: "WRONG_OUTPUT"});
    expect(comparator.compare).not.toHaveBeenCalled();
  });
  it("accepts a fast student run after a slow runner acquisition", async () => {
    const { engine, comparator, input } = fixture(8_000);
    const evaluation = evaluateEnhancedCase({ engine, comparator }, input);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await evaluation).toMatchObject({ kind: "verdict", outcome: "PASSED" });
    expect(engine.run).toHaveBeenCalledWith(expect.objectContaining({ timeLimitMs: 3_000 }));
    expect(comparator.compare).toHaveBeenCalledOnce();
  });

  it("preserves the student time-limit verdict after waiting for a runner", async () => {
    const { engine, comparator, input } = fixture(11_000, {
      ...passed, outcome: "TIME_LIMIT", runtimeMs: 3_000,
    });
    const evaluation = evaluateEnhancedCase({ engine, comparator }, input);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(await evaluation).toMatchObject({ kind: "verdict", outcome: "TIME_LIMIT" });
    expect(comparator.compare).not.toHaveBeenCalled();
  });

  it("stops waiting at the overall deadline and tracks the occupied runner", async () => {
    const { engine, comparator, input } = fixture(70_000);
    const evaluation = evaluateEnhancedCase({ engine, comparator }, input);
    await vi.advanceTimersByTimeAsync(65_000);
    const result = await evaluation;
    expect(result.kind).toBe("deadline");
    if (result.kind !== "deadline") throw new Error("expected deadline");
    expect(result.pendingExecution).toBeDefined();
    let settled = false;
    void result.pendingExecution!.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result.pendingExecution;
    expect(settled).toBe(true);
    expect(comparator.compare).not.toHaveBeenCalled();
  });

  it("classifies a run cut short by the overall deadline as a judge failure", async () => {
    const { engine, comparator, input } = fixture(1_000, {
      ...passed, outcome: "TIME_LIMIT", runtimeMs: 1_000,
    });
    input.deadlineAt = Date.now() + 2_000;
    const evaluation = evaluateEnhancedCase({ engine, comparator }, input);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await evaluation).toEqual({ kind: "deadline" });
    expect(engine.run).toHaveBeenCalledWith(expect.objectContaining({ timeLimitMs: 2_000 }));
    expect(comparator.compare).not.toHaveBeenCalled();
  });
});
