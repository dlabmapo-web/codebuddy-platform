import { describe, expect, it } from "vitest";

import {
  caseOutcomeFor,
  nextProgress,
  normalizeOutput,
  shouldStopAfter,
  scoreRun,
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
    ).toEqual({ status: "PASSED", passedCount: 2, score: 100, runtimeMs: 120 });
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
      nextProgress({ previous: null, status: "PASSED", passedCount: 5, score: 100 }),
    ).toEqual({
      status: "SOLVED",
      attemptCount: 1,
      bestPassed: 5,
      bestScore: 100,
      solvedNow: true,
    });
  });

  it("does not demote a solved problem on a later wrong answer", () => {
    expect(
      nextProgress({
        previous: { status: "SOLVED", attemptCount: 3, bestPassed: 5, bestScore: 0 },
        status: "FAILED",
        passedCount: 1,
        score: 0,
      }),
    ).toMatchObject({ status: "SOLVED", attemptCount: 4, solvedNow: false });
  });

  it("keeps the best case count across attempts", () => {
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 1, bestPassed: 4, bestScore: 0 },
        status: "FAILED",
        passedCount: 2,
        score: 0,
      }),
    ).toMatchObject({ bestPassed: 4 });
  });

  it("does not count a judge fault as an attempt", () => {
    // Our failure, not the student's. v1 gets this right and it must survive.
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 2, bestPassed: 3, bestScore: 0 },
        status: "ERRORED",
        passedCount: 0,
        score: 0,
      }),
    ).toMatchObject({ attemptCount: 2, bestPassed: 3, solvedNow: false });
  });

  it("leaves a solved problem solved after a judge fault", () => {
    expect(
      nextProgress({
        previous: { status: "SOLVED", attemptCount: 2, bestPassed: 5, bestScore: 0 },
        status: "ERRORED",
        passedCount: 0,
        score: 0,
      }),
    ).toMatchObject({ status: "SOLVED", attemptCount: 2 });
  });
});


describe("scoreRun", () => {
  it("scores a full pass as exactly 100 whatever the case count", () => {
    // Both ends must be exact: they are the values a student notices.
    for (const totalCount of [1, 3, 4, 7, 13]) {
      expect(scoreRun({ passedCount: totalCount, totalCount }), `${totalCount}`)
        .toBe(100);
    }
  });

  it("scores no passes as exactly 0", () => {
    expect(scoreRun({ passedCount: 0, totalCount: 5 })).toBe(0);
  });

  it("gives the same score for the same work at different case counts", () => {
    // Splitting one case into two is an authoring detail and must not change
    // what a student earns for identical work.
    expect(scoreRun({ passedCount: 1, totalCount: 2 })).toBe(50);
    expect(scoreRun({ passedCount: 2, totalCount: 4 })).toBe(50);
    expect(scoreRun({ passedCount: 5, totalCount: 10 })).toBe(50);
  });

  it("rounds rather than floors", () => {
    // 2 of 3 reads 67, not 66.
    expect(scoreRun({ passedCount: 2, totalCount: 3 })).toBe(67);
    expect(scoreRun({ passedCount: 1, totalCount: 3 })).toBe(33);
  });

  it("returns 0 rather than dividing by zero", () => {
    expect(scoreRun({ passedCount: 0, totalCount: 0 })).toBe(0);
  });
});

describe("summarizeRun scoring", () => {
  it("counts skipped cases toward the denominator", () => {
    // Grading stopped after case 1, but the problem still had five cases, so
    // this is 0 of 100 — not 0 of 20.
    expect(
      summarizeRun([{ outcome: "WRONG_OUTPUT", runtimeMs: 5 }], 5),
    ).toMatchObject({ score: 0, passedCount: 0 });
  });

  it("scores a partial run against the full case count", () => {
    expect(
      summarizeRun(
        [
          { outcome: "PASSED", runtimeMs: 4 },
          { outcome: "PASSED", runtimeMs: 6 },
          { outcome: "WRONG_OUTPUT", runtimeMs: 5 },
        ],
        5,
      ),
    ).toMatchObject({ score: 40, passedCount: 2, status: "FAILED" });
  });
});

describe("nextProgress scoring", () => {
  it("keeps the best score across attempts", () => {
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 1, bestPassed: 4, bestScore: 80 },
        status: "FAILED",
        passedCount: 1,
        score: 20,
      }),
    ).toMatchObject({ bestScore: 80 });
  });

  it("raises the best score on a better attempt", () => {
    expect(
      nextProgress({
        previous: { status: "IN_PROGRESS", attemptCount: 1, bestPassed: 1, bestScore: 20 },
        status: "PASSED",
        passedCount: 5,
        score: 100,
      }),
    ).toMatchObject({ bestScore: 100, status: "SOLVED" });
  });

  it("leaves the best score untouched after a judge fault", () => {
    expect(
      nextProgress({
        previous: { status: "SOLVED", attemptCount: 2, bestPassed: 5, bestScore: 100 },
        status: "ERRORED",
        passedCount: 0,
        score: 0,
      }),
    ).toMatchObject({ bestScore: 100, attemptCount: 2 });
  });
});
