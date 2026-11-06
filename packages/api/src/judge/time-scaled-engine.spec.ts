import { describe, expect, it, vi } from "vitest";

import type { ExecutionEngine, ExecutionResult } from "./execution-engine.js";
import { staleRunningAfterMs, TimeScaledEngine, timeScaleOf } from "./time-scaled-engine.js";

const request = { code: "print(42)", stdin: "", timeLimitMs: 3_000, memoryLimitMb: 256 };

function inner(result: Partial<ExecutionResult> = {}) {
  return {
    version: "pyodide-0.27.5",
    run: vi.fn(async (): Promise<ExecutionResult> => ({
      stdout: "42\n", stderr: "", outcome: "PASSED", runtimeMs: 6_000, ...result,
    })),
    dispose: vi.fn(async () => undefined),
  } satisfies ExecutionEngine;
}

describe("TimeScaledEngine", () => {
  it("gives the engine the authored limit times the scale and reports native-equivalent time", async () => {
    const engine = inner();
    const scaled = new TimeScaledEngine(engine, 2.5);

    await expect(scaled.run(request)).resolves.toEqual({
      stdout: "42\n", stderr: "", outcome: "PASSED", runtimeMs: 2_400,
    });
    expect(engine.run).toHaveBeenCalledWith({ ...request, timeLimitMs: 7_500 });
  });

  it("keeps a timeout a timeout, reported at about the authored limit", async () => {
    const scaled = new TimeScaledEngine(inner({ stdout: "", outcome: "TIME_LIMIT", runtimeMs: 7_521 }), 2.5);

    await expect(scaled.run(request)).resolves.toMatchObject({ outcome: "TIME_LIMIT", runtimeMs: 3_008 });
  });

  it("rounds a scaled limit up, so the budget is never short", async () => {
    const engine = inner();

    await new TimeScaledEngine(engine, 2.5).run({ ...request, timeLimitMs: 333 });

    expect(engine.run).toHaveBeenCalledWith(expect.objectContaining({ timeLimitMs: 833 }));
  });

  it("passes cancellation, truncation and failures through untouched", async () => {
    const signal = new AbortController().signal;
    const truncated = inner({ outputTruncated: true });
    await expect(new TimeScaledEngine(truncated, 2).run({ ...request, signal })).resolves.toMatchObject({ outputTruncated: true });
    expect(truncated.run).toHaveBeenCalledWith(expect.objectContaining({ signal }));

    const failing = inner();
    failing.run.mockRejectedValueOnce(new Error("sandbox did not answer in time"));
    await expect(new TimeScaledEngine(failing, 2).run(request)).rejects.toThrow("sandbox did not answer in time");
  });

  it("keeps the recorded engine version and disposes the engine it wraps", async () => {
    const engine = inner();
    const scaled = new TimeScaledEngine(engine, 2.5);

    expect(scaled.version).toBe("pyodide-0.27.5");
    await scaled.dispose();
    expect(engine.dispose).toHaveBeenCalled();
  });

  it.each([0.5, 0, 5.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses a scale of %s", (scale) => {
    expect(() => new TimeScaledEngine(inner(), scale)).toThrow(RangeError);
  });

  it("reports its scale, and an unwrapped engine runs at native speed", () => {
    expect(timeScaleOf(new TimeScaledEngine(inner(), 2.5))).toBe(2.5);
    expect(timeScaleOf(inner())).toBe(1);
  });
});

describe("staleRunningAfterMs", () => {
  it("stays at ten minutes at native speed and covers the longest scaled run beyond it", () => {
    expect(staleRunningAfterMs(1)).toBe(600_000);
    expect(staleRunningAfterMs(2.5)).toBe(810_000);
    expect(staleRunningAfterMs(5)).toBe(1_560_000);
  });
});
