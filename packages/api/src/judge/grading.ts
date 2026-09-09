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
 * Grading stops only when continuing would cost a lot and say nothing.
 *
 * A wrong answer is cheap to keep going from — the program ran and exited — and
 * it is the case where finishing matters most. A student who fails case 3 and
 * passes 1, 2, 4 and 5 needs to be told exactly that: "wrong on `n = 7`" is
 * something they can act on, where "wrong somewhere after case 2" is not. The
 * score depends on it too, and that is the part that is not a matter of taste —
 * `scoreRun` counts unrun cases as failures, so stopping early recorded that
 * student as 40 out of 100 when their work was worth 80. `bestScore`, their
 * points and their class ranking all read that number.
 *
 * A crash is the same bargain: it ends the process immediately, and "crashes
 * only on `n = 0`" is a real diagnosis.
 *
 * A timeout is not. Every remaining case would burn the full time limit before
 * failing the same way, so an infinite loop on a five-case problem would hold a
 * judge slot for five times the limit instead of once, and tell nobody
 * anything. A memory limit is the same, with memory pressure on top.
 */
export function shouldStopAfter(outcome: CaseOutcome): boolean {
  return outcome === "TIME_LIMIT" || outcome === "MEMORY_LIMIT";
}

export function submissionStatusFor(
  outcomes: ReadonlyArray<CaseOutcome>,
): SubmissionStatus {
  if (outcomes.length === 0) return "ERRORED";
  return outcomes.every((outcome) => outcome === "PASSED") ? "PASSED" : "FAILED";
}

/**
 * Every problem is worth 100, whatever its case count.
 *
 * Case count is an authoring detail: a student must not score differently on
 * the same work because an author split one case into two. `round`, not
 * `floor`, so 2 of 3 reads 67 rather than 66 — and both ends stay exact, which
 * is what a student actually notices.
 *
 * Skipped cases count toward the denominator, and after `shouldStopAfter` only
 * a timeout or a memory limit skips anything. Those cases would have failed the
 * same way, so counting them as failures is the honest reading rather than a
 * penalty for stopping early.
 */
export function scoreRun(input: {
  passedCount: number;
  totalCount: number;
}): number {
  if (input.totalCount <= 0) return 0;
  return Math.round((input.passedCount / input.totalCount) * 100);
}

export type GradeSummary = {
  status: SubmissionStatus;
  passedCount: number;
  score: number;
  runtimeMs: number;
};

export function summarizeRun(
  cases: ReadonlyArray<{ outcome: CaseOutcome; runtimeMs: number }>,
  /** Includes cases skipped after an early exit — the denominator is the
   *  exercise's case count, not the number actually executed. */
  totalCount: number = cases.length,
): GradeSummary {
  const passedCount = cases.filter((item) => item.outcome === "PASSED").length;
  return {
    status: submissionStatusFor(cases.map((item) => item.outcome)),
    passedCount,
    score: scoreRun({ passedCount, totalCount }),
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
  previous: {
    status: string;
    attemptCount: number;
    bestPassed: number;
    bestScore: number;
  } | null;
  status: SubmissionStatus;
  passedCount: number;
  score: number;
}): {
  status: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED";
  attemptCount: number;
  bestPassed: number;
  bestScore: number;
  solvedNow: boolean;
} {
  const previous = input.previous;
  const wasSolved = previous?.status === "SOLVED";

  if (input.status === "ERRORED" || input.status === "CANCELLED") {
    return {
      status: wasSolved ? "SOLVED" : (previous?.status as never) ?? "IN_PROGRESS",
      attemptCount: previous?.attemptCount ?? 0,
      bestPassed: previous?.bestPassed ?? 0,
      bestScore: previous?.bestScore ?? 0,
      solvedNow: false,
    };
  }

  const solved = wasSolved || input.status === "PASSED";
  return {
    status: solved ? "SOLVED" : "IN_PROGRESS",
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    bestPassed: Math.max(previous?.bestPassed ?? 0, input.passedCount),
    // Never reduced by a later worse attempt, for the same reason SOLVED is
    // permanent: experimenting after succeeding must not cost anything.
    bestScore: Math.max(previous?.bestScore ?? 0, input.score),
    solvedNow: !wasSolved && input.status === "PASSED",
  };
}
