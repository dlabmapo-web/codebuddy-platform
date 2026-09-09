import { describe, expect, it } from "vitest";

import {
  isSettledOperationStatus,
  operationRunProgress,
} from "./operations.js";

const run = (over: Partial<Parameters<typeof operationRunProgress>[0]> = {}) => ({
  status: "RUNNING" as const,
  plannedCount: 10,
  dispatchedCount: 10,
  completedCount: 0,
  failedCount: 0,
  ...over,
});

describe("operationRunProgress", () => {
  it("counts a failed repair as settled, not as outstanding", () => {
    // A run whose repairs all errored is finished. Leaving them outstanding
    // would leave the console reporting work that will never land.
    expect(operationRunProgress(run({ completedCount: 7, failedCount: 3 })))
      .toEqual({ settled: 10, total: 10, ratio: 1 });
  });

  it("reports a run that dispatched nothing as complete, not as zero", () => {
    // The difference matters: a bar stuck at 0% reads as broken, and a plan
    // that found nothing is a finished run rather than a stalled one.
    expect(operationRunProgress(run({ plannedCount: 0, dispatchedCount: 0 })))
      .toEqual({ settled: 0, total: 0, ratio: 1 });
  });

  it("measures against what was dispatched, not what was planned", () => {
    // Repairs are written in chunks, so mid-run the two disagree. Measuring
    // against the plan would make the bar jump backwards as chunks land.
    expect(
      operationRunProgress(run({ dispatchedCount: 4, completedCount: 2 })),
    ).toMatchObject({ settled: 2, total: 4, ratio: 0.5 });
  });

  it("never exceeds one", () => {
    expect(
      operationRunProgress(run({ dispatchedCount: 2, completedCount: 5 })).ratio,
    ).toBe(1);
  });
});

describe("isSettledOperationStatus", () => {
  it("treats planning and running as unsettled", () => {
    expect(isSettledOperationStatus("PLANNING")).toBe(false);
    expect(isSettledOperationStatus("RUNNING")).toBe(false);
  });

  it("treats a failed run as settled — nothing further happens on its own", () => {
    expect(isSettledOperationStatus("FAILED")).toBe(true);
    expect(isSettledOperationStatus("COMPLETED")).toBe(true);
  });
});
