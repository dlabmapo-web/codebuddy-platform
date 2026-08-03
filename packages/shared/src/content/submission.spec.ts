import { describe, expect, it } from "vitest";

import {
  buildCaseCells,
  isJudgeFault,
  isTerminalStatus,
  submissionCaseSchema,
  summarizeOutcomes,
} from "./submission.js";

describe("isTerminalStatus", () => {
  it("treats queued and running as in flight", () => {
    expect(isTerminalStatus("QUEUED")).toBe(false);
    expect(isTerminalStatus("RUNNING")).toBe(false);
  });

  it("treats every verdict as terminal, including judge faults", () => {
    for (const status of ["PASSED", "FAILED", "ERRORED", "CANCELLED"] as const) {
      expect(isTerminalStatus(status), status).toBe(true);
    }
  });
});

describe("isJudgeFault", () => {
  it("separates a judge fault from a wrong answer", () => {
    // The distinction decides whether the attempt counts against the student.
    expect(isJudgeFault("ERRORED")).toBe(true);
    expect(isJudgeFault("FAILED")).toBe(false);
  });
});

describe("buildCaseCells", () => {
  it("renders unreported cases as pending rather than omitting them", () => {
    const cells = buildCaseCells({
      totalCount: 3,
      reported: [{ position: 1, outcome: "PASSED", isSample: true }],
    });

    expect(cells).toHaveLength(3);
    expect(cells[0]).toEqual({
      state: "done",
      position: 1,
      outcome: "PASSED",
      isSample: true,
    });
    expect(cells[1]).toEqual({ state: "pending", position: 2 });
  });

  it("keeps positions stable so the checklist does not reflow", () => {
    const cells = buildCaseCells({
      totalCount: 3,
      reported: [{ position: 3, outcome: "WRONG_OUTPUT", isSample: false }],
    });

    expect(cells.map((cell) => cell.position)).toEqual([1, 2, 3]);
    expect(cells[2]!.state).toBe("done");
  });

  it("handles a submission with nothing reported yet", () => {
    const cells = buildCaseCells({ totalCount: 2, reported: [] });
    expect(cells.every((cell) => cell.state === "pending")).toBe(true);
  });
});

describe("summarizeOutcomes", () => {
  it("does not count skipped cases as failures", () => {
    // Early exit skips the rest; reporting nine failures for one wrong answer
    // would badly misrepresent the attempt.
    expect(
      summarizeOutcomes([
        { outcome: "PASSED" },
        { outcome: "WRONG_OUTPUT" },
        { outcome: "SKIPPED" },
        { outcome: "SKIPPED" },
      ]),
    ).toEqual({ passed: 1, failed: 1, skipped: 2 });
  });

  it("counts every non-passing, non-skipped outcome as a failure", () => {
    expect(
      summarizeOutcomes([
        { outcome: "TIME_LIMIT" },
        { outcome: "MEMORY_LIMIT" },
        { outcome: "RUNTIME_ERROR" },
      ]),
    ).toEqual({ passed: 0, failed: 3, skipped: 0 });
  });
});

describe("submissionCaseSchema", () => {
  it("strips a hidden case's expectations if a service supplies them", () => {
    // The barrier is structural: even a defective service cannot widen what a
    // hidden case discloses, because the schema drops unknown keys and the
    // nullable fields are the only channel.
    const parsed = submissionCaseSchema.parse({
      position: 2,
      isSample: false,
      outcome: "WRONG_OUTPUT",
      runtimeMs: 12,
      input: null,
      expectedOutput: null,
      actualOutput: null,
      secretDiff: "HIDDEN_EXPECTATION",
    });

    expect(JSON.stringify(parsed)).not.toContain("HIDDEN_EXPECTATION");
  });
});
