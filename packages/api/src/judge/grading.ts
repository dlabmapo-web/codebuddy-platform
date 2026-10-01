import { isOutputCorrect, type CaseOutcome, type SubmissionStatus } from "@cove/shared";

import type { ComparisonResult } from "./comparator-pool.js";

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
  // A soft-timeout warning is a correct answer that earned fewer points, so
  // it must not fail the run; the weighted score is where it shows up.
  return outcomes.every(isOutputCorrect) ? "PASSED" : "FAILED";
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

/**
 * What one case earned.
 *
 * Correct output pays the full weight; a soft-timeout warning pays the weight
 * less its penalty, which is the only place the two differ; everything else
 * pays nothing. Never derived from a passed count — a run of warnings is fully
 * correct and still worth less than full marks.
 */
export function awardedWeightFor(input: {
  outcome: CaseOutcome;
  weight: number;
  softPenalty: number | null;
}): number {
  if (input.outcome === "PASSED") return input.weight;
  if (input.outcome !== "PASSED_WITH_WARNING") return 0;
  // Clamped rather than trusted: a penalty above the weight would pay a correct
  // answer less than a wrong one, and validation is not the judge's job.
  const penalty = Math.min(Math.max(input.softPenalty ?? 0, 0), input.weight);
  return input.weight - penalty;
}

/**
 * The 0-100 figure every existing reader still wants.
 *
 * `Submission.score` keeps its meaning, so `bestScore`, records, rankings and
 * points need no migration; the weighted truth lives beside it in
 * `earnedWeight`/`possibleWeight`. Half-up, matching `scoreRun`, so a student
 * sees the same rounding whichever mode their exercise uses.
 */
export function scoreWeightedRun(input: {
  earnedWeight: number;
  possibleWeight: number;
}): number {
  if (input.possibleWeight <= 0) return 0;
  return Math.round((input.earnedWeight / input.possibleWeight) * 100);
}

/**
 * The material score in integer hundredths.
 *
 * Integer arithmetic throughout: a grade that decides a transcript should not
 * inherit a float's rounding, and hundredths are the smallest unit anything
 * displays.
 */
export function appliedScoreHundredthsFor(input: {
  earnedWeight: number;
  possibleWeight: number;
  materialMaximumHundredths: number;
  policy: "PROPORTIONAL" | "ABSOLUTE_CAP";
}): number {
  if (input.possibleWeight <= 0) return 0;
  if (input.policy === "ABSOLUTE_CAP") {
    return Math.min(input.materialMaximumHundredths, input.earnedWeight * 100);
  }
  const scaled =
    (input.earnedWeight * input.materialMaximumHundredths) / input.possibleWeight;
  return Math.round(scaled);
}

/**
 * Whether an enhanced run must stop entirely.
 *
 * Deliberately none of the per-case verdicts: enhanced mode continues after a
 * wrong answer, a crash and an individual timeout, which is what the observed
 * Elice loop does. Only the job-level conditions end it, and an aborted run is
 * not a grade — partial weights stay diagnostic and nothing updates best score,
 * completion or rewards.
 */
export function shouldAbortEnhancedRun(input: {
  deadlineExceeded: boolean;
  infrastructureFailed: boolean;
  policyRevoked: boolean;
}): boolean {
  return (
    input.deadlineExceeded || input.infrastructureFailed || input.policyRevoked
  );
}

/**
 * Why an enhanced case could not be judged. Every one is ours — a matcher that
 * ran out of budget, a pattern the author wrote that Python cannot compile, a
 * comparator that failed — so none of them may become the student's verdict.
 */
export type GraderFault =
  | "COMPARATOR_TIMEOUT"
  | "COMPARATOR_INVALID_PATTERN"
  | "COMPARATOR_FAILURE";

export type EliceCaseDecision =
  | { kind: "verdict"; outcome: CaseOutcome }
  | { kind: "grader-fault"; fault: GraderFault; detail?: string }
  /** The run's total budget ran out before this case could be judged. */
  | { kind: "deadline" };

/**
 * One enhanced case, in the order §6 of the implementation spec fixes.
 *
 * A resource verdict or a crash stands on its own, before any comparison:
 * runtime-error-before-comparison is kept as an explicit divergence from the
 * observed Elice decision function until V2 establishes what the surrounding
 * platform does with a program that prints the right thing and then fails.
 * Otherwise the comparator decides, and the soft threshold only ever applies
 * to output that already matched — strictly slower than the threshold, so a
 * run that lands exactly on it keeps its full weight.
 */
export function eliceCaseDecisionFor(input: {
  engineOutcome: CaseOutcome;
  runtimeMs: number;
  softTimeLimitMs: number | null;
  comparison: ComparisonResult | null;
}): EliceCaseDecision {
  if (input.engineOutcome !== "PASSED") {
    return { kind: "verdict", outcome: input.engineOutcome };
  }
  const comparison = input.comparison;
  if (!comparison) {
    return { kind: "grader-fault", fault: "COMPARATOR_FAILURE" };
  }
  switch (comparison.kind) {
    case "no-match":
      return { kind: "verdict", outcome: "WRONG_OUTPUT" };
    case "match":
      return {
        kind: "verdict",
        outcome:
          input.softTimeLimitMs !== null && input.runtimeMs > input.softTimeLimitMs
            ? "PASSED_WITH_WARNING"
            : "PASSED",
      };
    case "timeout":
      return { kind: "grader-fault", fault: "COMPARATOR_TIMEOUT" };
    case "deadline":
      return { kind: "deadline" };
    case "invalid-pattern":
      return {
        kind: "grader-fault",
        fault: "COMPARATOR_INVALID_PATTERN",
        detail: comparison.detail,
      };
    case "error":
      return {
        kind: "grader-fault",
        fault: "COMPARATOR_FAILURE",
        detail: comparison.detail,
      };
  }
}

export type WeightedGradeSummary = GradeSummary & {
  earnedWeight: number;
  possibleWeight: number;
  appliedScoreHundredths: number | null;
};

/**
 * The verdict of a completed enhanced run.
 *
 * Status, passed count and runtime come from the same function the legacy
 * path uses, so "did this run pass" means one thing everywhere. Only the score
 * differs: it is earned weight over possible weight, where possible weight is
 * every case's — a case that never ran contributes its weight to the
 * denominator and nothing to the numerator, exactly as a legacy skip counts
 * against the case total.
 */
export function summarizeWeightedRun(input: {
  cases: ReadonlyArray<{
    outcome: CaseOutcome;
    runtimeMs: number;
    awardedWeight: number;
  }>;
  caseWeights: ReadonlyArray<number>;
  materialMaximumHundredths: number | null;
  materialScorePolicy: "PROPORTIONAL" | "ABSOLUTE_CAP" | null;
}): WeightedGradeSummary {
  const executed = input.cases.filter((item) => item.outcome !== "SKIPPED");
  const base = summarizeRun(executed, input.caseWeights.length);
  const earnedWeight = input.cases.reduce(
    (total, item) => total + item.awardedWeight,
    0,
  );
  const possibleWeight = input.caseWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  return {
    ...base,
    score: scoreWeightedRun({ earnedWeight, possibleWeight }),
    earnedWeight,
    possibleWeight,
    appliedScoreHundredths:
      input.materialMaximumHundredths !== null && input.materialScorePolicy !== null
        ? appliedScoreHundredthsFor({
            earnedWeight,
            possibleWeight,
            materialMaximumHundredths: input.materialMaximumHundredths,
            policy: input.materialScorePolicy,
          })
        : null,
  };
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
  const passedCount = cases.filter((item) => isOutputCorrect(item.outcome)).length;
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
 *
 * `isRepair` is the third case, and it is the same idea as the first. A
 * platform re-grade carries the student's own code against a corrected test
 * case, so the verdict is theirs and updates their status and best score — but
 * pressing an operator's button is not an attempt they made, so the count does
 * not move. Without it, correcting one test case would silently add an attempt
 * to every affected student, and correcting it twice would add two.
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
  /** True when the platform wrote this submission to repair a record. */
  isRepair?: boolean;
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
  const attemptCount = previous?.attemptCount ?? 0;
  return {
    status: solved ? "SOLVED" : "IN_PROGRESS",
    attemptCount: input.isRepair ? attemptCount : attemptCount + 1,
    bestPassed: Math.max(previous?.bestPassed ?? 0, input.passedCount),
    // Never reduced by a later worse attempt, for the same reason SOLVED is
    // permanent: experimenting after succeeding must not cost anything.
    bestScore: Math.max(previous?.bestScore ?? 0, input.score),
    solvedNow: !wasSolved && input.status === "PASSED",
  };
}
