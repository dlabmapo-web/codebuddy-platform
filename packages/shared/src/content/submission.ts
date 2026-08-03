import { z } from "zod";

/**
 * Submission results as a student may see them.
 *
 * The disclosure rule is structural, like `learn.ts`: a case carries `input`,
 * `expectedOutput`, and `actualOutput` only when it is a sample. A hidden case
 * reports its position and outcome and nothing else — otherwise a student can
 * reconstruct hidden expectations by submitting probes and reading the diff.
 */

export const submissionStatuses = [
  "QUEUED",
  "RUNNING",
  "PASSED",
  "FAILED",
  "ERRORED",
  "CANCELLED",
] as const;
export const submissionStatusSchema = z.enum(submissionStatuses);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const caseOutcomes = [
  "PASSED",
  "WRONG_OUTPUT",
  "RUNTIME_ERROR",
  "TIME_LIMIT",
  "MEMORY_LIMIT",
  "SKIPPED",
] as const;
export const caseOutcomeSchema = z.enum(caseOutcomes);
export type CaseOutcome = z.infer<typeof caseOutcomeSchema>;

/** A verdict is in hand; anything else is still moving. */
export function isTerminalStatus(status: SubmissionStatus): boolean {
  return status !== "QUEUED" && status !== "RUNNING";
}

/**
 * A judge fault is not a wrong answer. It must not count as an attempt, and the
 * student must be told the difference.
 */
export function isJudgeFault(status: SubmissionStatus): boolean {
  return status === "ERRORED";
}

export const submissionCaseSchema = z.object({
  position: z.number().int().positive(),
  isSample: z.boolean(),
  outcome: caseOutcomeSchema,
  runtimeMs: z.number().int().nonnegative().nullable(),
  /** Sample cases only — see the note above. */
  input: z.string().nullable(),
  expectedOutput: z.string().nullable(),
  actualOutput: z.string().nullable(),
});
export type SubmissionCaseResult = z.infer<typeof submissionCaseSchema>;

export const submissionResultSchema = z.object({
  submissionId: z.uuid(),
  materialId: z.uuid(),
  status: submissionStatusSchema,
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  /** 0-100. Every problem is worth the same, whatever its case count. */
  score: z.number().int().min(0).max(100),
  runtimeMs: z.number().int().nonnegative().nullable(),
  failureReason: z.string().nullable(),
  elapsedSec: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  gradedAt: z.iso.datetime().nullable(),
  cases: z.array(submissionCaseSchema),
});
export type SubmissionResult = z.infer<typeof submissionResultSchema>;

export const submissionSummarySchema = z.object({
  submissionId: z.uuid(),
  status: submissionStatusSchema,
  passedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  runtimeMs: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
});
export type SubmissionSummary = z.infer<typeof submissionSummarySchema>;

export const submitExerciseSchema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid(),
  code: z.string().min(1).max(100_000),
});

export const submissionAcceptedSchema = z.object({
  submissionId: z.uuid(),
  totalCount: z.number().int().positive(),
});

export const submissionInputSchema = z.object({
  academyId: z.uuid(),
  submissionId: z.uuid(),
});

/* --------------------------------------------------------- live progress */

/**
 * Pushed over SSE while a submission runs. Modelled on the same
 * `job.updateProgress` mechanism already used for streaming in `docquery`.
 */
export const submissionProgressEventSchema = z.object({
  submissionId: z.uuid(),
  position: z.number().int().positive(),
  of: z.number().int().positive(),
  outcome: caseOutcomeSchema,
  isSample: z.boolean(),
});
export type SubmissionProgressEvent = z.infer<
  typeof submissionProgressEventSchema
>;

/* ------------------------------------------------------------ pure logic */

/**
 * A submission is graded case by case, so the panel fills in as results
 * arrive. Cases not yet reported render as pending rather than absent, which
 * keeps the checklist from reflowing as it completes.
 */
export type CaseCell =
  | { state: "pending"; position: number }
  | { state: "done"; position: number; outcome: CaseOutcome; isSample: boolean };

export function buildCaseCells(input: {
  totalCount: number;
  reported: ReadonlyArray<{
    position: number;
    outcome: CaseOutcome;
    isSample: boolean;
  }>;
}): CaseCell[] {
  const byPosition = new Map(
    input.reported.map((item) => [item.position, item]),
  );
  return Array.from({ length: input.totalCount }, (_unused, index) => {
    const position = index + 1;
    const done = byPosition.get(position);
    return done
      ? {
          state: "done" as const,
          position,
          outcome: done.outcome,
          isSample: done.isSample,
        }
      : { state: "pending" as const, position };
  });
}

/**
 * Grading stops at the first failure, so a student sees "3 of 10" rather than a
 * count that silently excludes cases nobody ran. Skipped cases are not failures
 * and must not read as though the code was wrong ten times over.
 */
export function summarizeOutcomes(
  cases: ReadonlyArray<{ outcome: CaseOutcome }>,
): { passed: number; failed: number; skipped: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of cases) {
    if (item.outcome === "PASSED") passed += 1;
    else if (item.outcome === "SKIPPED") skipped += 1;
    else failed += 1;
  }
  return { passed, failed, skipped };
}
