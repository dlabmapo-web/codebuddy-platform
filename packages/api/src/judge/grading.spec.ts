import { describe, expect, it } from "vitest";

import {
  caseOutcomeFor,
  nextProgress,
  normalizeOutput,
  shouldStopAfter,
  submissionStatusFor,
  summarizeRun,
} from "./grading.js";

describe("normalizeOutput", () => {
  it("ignores trailing whitespace and newlines", () => {
    expect(normalizeOutput("3\n\n  ")).toBe("3");
  });

  it("preserves interior and leading whitespace", () => {
    expect(normalizeOutput("  1  2\n3")).toBe("  1  2\n3");
  });

  it("normalises CRLF so a Windows-authored expectation still matches", () => {
    expect(normalizeOutput("1\r\n2")).toBe(normalizeOutput("1\n2"));
  });
});

describe("caseOutcomeFor", () => {
  it("passes on a match ignoring a trailing newline", () => {
    expect(
      caseOutcomeFor({ engineOutcome: "PASSED", stdout: "3\n", expectedOutput: "3" }),
    ).toBe("PASSED");
  });

  it("reports wrong output on a mismatch", () => {
    expect(
      caseOutcomeFor({ engineOutcome: "PASSED", stdout: "4", expectedOutput: "3" }),
    ).toBe("WRONG_OUTPUT");
  });

  it("keeps a timeout as a timeout rather than calling it wrong", () => {
    // Reporting TIME_LIMIT as WRONG_OUTPUT would send the student hunting for
    // a logic bug when the real problem is an infinite loop.
    expect(
      caseOutcomeFor({ engineOutcome: "TIME_LIMIT", stdout: "", expectedOutput: "3" }),
    ).toBe("TIME_LIMIT");
  });

  it("keeps a runtime error even when stdout happens to match", () => {
    expect(
      caseOutcomeFor({
        engineOutcome: "RUNTIME_ERROR",
        stdout: "3",
        expectedOutput: "3",
      }),
    ).toBe("RUNTIME_ERROR");
  });
});

describe("shouldStopAfter", () => {
  it("continues only while cases pass", () => {
    expect(shouldStopAfter("PASSED")).toBe(false);
    expect(shouldStopAfter("WRONG_OUTPUT")).toBe(true);
    expect(shouldStopAfter("TIME_LIMIT")).toBe(true);
  });
});

describe("submissionStatusFor", () => {
  it("passes only when every case passed", () => {
    expect(submissionStatusFor(["PASSED", "PASSED"])).toBe("PASSED");
    expect(submissionStatusFor(["PASSED", "WRONG_OUTPUT"])).toBe("FAILED");
  });

  it("treats a run with no cases as a judge fault, not a pass", () => {
    // An exercise reaching the judge with zero cases is our bug; awarding a
    // pass would be the worst possible failure mode.
    expect(submissionStatusFor([])).toBe("ERRORED");
  });
});

describe("summarizeRun", () => {
  it("reports the slowest case, not the total", () => {
    // The time limit applies per case, so the aggregate must be the maximum.
    expect(
      summarizeRun([
        { outcome: "PASSED", runtimeMs: 40 },
        { outcome: "PASSED", runtimeMs: 120 },
      ]),
    ).toEqual({ status: "PASSED", passedCount: 2, runtimeMs: 120 });
  });

  it("counts passes before an early exit", () => {
    expect(
      summarizeRun([
        { outcome: "PASSED", runtimeMs: 10 },
        { outcome: "WRONG_OUTPUT", runtimeMs: 12 },
        { outcome: "SKIPPED", runtimeMs: 0 },
      ]),
    ).toMatchObject({ status: "FAILED", passedCount: 1 });
  });
});

describe("nextProgress", () => {
  it("records a first solve", () => {
    expect(
      nextProgress({ previous: null, status: "PASSED", passedCount: 5 }),
    ).toEqual({
      status: "SOLVED",
      attemptCount: 1,
      bestPassed: 5,
      solvedNow: true,
    });
  });

  it("does not demote a solved problem on a later wrong answer", () => {
    expect(
      nextProgress({
        previous: { status: "SOLVED", attemptCount: 3, bestPassed: 5 },
        status: "FAILED",
        passedCount: 1,
      }),
    ).toMatchObject({ status: "SOLVED", attemptCount: 4, solvedNow: false });
  });

  it("keeps the best case count across attempts", () => {
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 1, bestPassed: 4 },
        status: "FAILED",
        passedCount: 2,
      }),
    ).toMatchObject({ bestPassed: 4 });
  });

  it("does not count a judge fault as an attempt", () => {
    // Our failure, not the student's. v1 gets this right and it must survive.
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 2, bestPassed: 3 },
        status: "ERRORED",
        passedCount: 0,
      }),
    ).toMatchObject({ attemptCount: 2, bestPassed: 3, solvedNow: false });
  });

  it("leaves a solved problem solved after a judge fault", () => {
    expect(
      nextProgress({
        previous: { status: "SOLVED", attemptCount: 2, bestPassed: 5 },
        status: "ERRORED",
        passedCount: 0,
      }),
    ).toMatchObject({ status: "SOLVED", attemptCount: 2 });
  });
});
