import type { CaseOutcome, SubmissionStatus } from "@cove/shared";

/**
 * Pure grading decisions, kept out of the worker so they are testable without
 * a Redis, a database, or a Python runtime.
 */

/**
 * Trailing whitespace is invisible in an editor, so failing a student over a
 * missing final newline teaches nothing. Interior whitespace is significant:
 * `1 2` and `1  2` are different answers.
 *
 * Must stay identical to the browser's `normalizeSampleOutput`, or a sample
 * that passes locally can fail on submit.
 */
export function normalizeOutput(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\s+$/u, "");
}

export function caseOutcomeFor(input: {
  engineOutcome: CaseOutcome;
  stdout: string;
  expectedOutput: string;
}): CaseOutcome {
  // A crash or a timeout is not a wrong answer, and reporting it as one points
  // the student at entirely the wrong problem.
  if (input.engineOutcome !== "PASSED") return input.engineOutcome;
  return normalizeOutput(input.stdout) === normalizeOutput(input.expectedOutput)
    ? "PASSED"
    : "WRONG_OUTPUT";
}

/**
 * Grading stops at the first failure. Most failing submissions fail on case
 * one, so this removes the majority of executions — and a student learns
 * nothing extra from nine more failures of the same bug.
 */
export function shouldStopAfter(outcome: CaseOutcome): boolean {
  return outcome !== "PASSED";
}

export function submissionStatusFor(
  outcomes: ReadonlyArray<CaseOutcome>,
): SubmissionStatus {
  if (outcomes.length === 0) return "ERRORED";
  return outcomes.every((outcome) => outcome === "PASSED") ? "PASSED" : "FAILED";
}

export type GradeSummary = {
  status: SubmissionStatus;
  passedCount: number;
  runtimeMs: number;
};

export function summarizeRun(
  cases: ReadonlyArray<{ outcome: CaseOutcome; runtimeMs: number }>,
): GradeSummary {
  return {
    status: submissionStatusFor(cases.map((item) => item.outcome)),
    passedCount: cases.filter((item) => item.outcome === "PASSED").length,
    // The slowest case, not the total: it is what the time limit applies to.
    runtimeMs: cases.reduce((slowest, item) => Math.max(slowest, item.runtimeMs), 0),
  };
}

/**
 * Progress after a verdict.
 *
 * A judge fault leaves the student's record untouched — it is our failure, not
 * theirs. `SOLVED` is permanent: a later wrong answer on a problem already
 * solved must not demote it.
 */
export function nextProgress(input: {
  previous: { status: string; attemptCount: number; bestPassed: number } | null;
  status: SubmissionStatus;
  passedCount: number;
}): {
  status: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED";
  attemptCount: number;
  bestPassed: number;
  solvedNow: boolean;
} {
  const previous = input.previous;
  const wasSolved = previous?.status === "SOLVED";

  if (input.status === "ERRORED" || input.status === "CANCELLED") {
    return {
      status: wasSolved ? "SOLVED" : (previous?.status as never) ?? "IN_PROGRESS",
      attemptCount: previous?.attemptCount ?? 0,
      bestPassed: previous?.bestPassed ?? 0,
      solvedNow: false,
    };
  }

  const solved = wasSolved || input.status === "PASSED";
  return {
    status: solved ? "SOLVED" : "IN_PROGRESS",
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    bestPassed: Math.max(previous?.bestPassed ?? 0, input.passedCount),
    solvedNow: !wasSolved && input.status === "PASSED",
  };
}
