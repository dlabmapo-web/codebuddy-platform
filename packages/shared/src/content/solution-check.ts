import { z } from "zod";

import { courseIdInputSchema } from "./course.js";
import { caseOutcomeSchema } from "./submission.js";

/**
 * The latest run of a problem's official solutions against its own test
 * cases. Staff only: it carries no test data and no program output, only what
 * each case did and the last line of an error.
 */
export const solutionCheckStatuses = [
  "QUEUED",
  "RUNNING",
  "PASSED",
  "FAILED",
  "NO_SOLUTION",
  "NOT_CHECKABLE",
  "ERRORED",
] as const;
export const solutionCheckStatusSchema = z.enum(solutionCheckStatuses);
export type SolutionCheckStatus = z.infer<typeof solutionCheckStatusSchema>;

export const pendingSolutionCheckStatuses = ["QUEUED", "RUNNING"] as const satisfies readonly SolutionCheckStatus[];
export function isSolutionCheckPending(status: SolutionCheckStatus): boolean {
  return (pendingSolutionCheckStatuses as readonly SolutionCheckStatus[]).includes(status);
}

/**
 * Lengths a spreadsheet cell is cut to without warning: Excel keeps 32,767
 * characters and Google Sheets (and Elice's case boxes) 50,000. Test data of
 * exactly this length almost always lost its end on the way in.
 */
export const spreadsheetCellLimits = [32_767, 50_000] as const;
export function looksSpreadsheetCut(text: string): boolean {
  return (spreadsheetCellLimits as readonly number[]).includes(text.length);
}

export const solutionCheckErrorSchema = z.object({
  type: z.string().max(80),
  message: z.string().max(200),
  line: z.number().int().positive().nullable(),
});
export type SolutionCheckError = z.infer<typeof solutionCheckErrorSchema>;

export const solutionCheckCaseSchema = z.object({
  position: z.number().int().positive(),
  isSample: z.boolean(),
  outcome: caseOutcomeSchema,
  runtimeMs: z.number().int().nonnegative().nullable(),
  limitMs: z.number().int().positive(),
  error: solutionCheckErrorSchema.nullable(),
  cutSuspected: z.boolean(),
});
export type SolutionCheckCase = z.infer<typeof solutionCheckCaseSchema>;

export const solutionCheckSolutionSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().max(80).nullable(),
  passed: z.boolean(),
  /** Why grading stopped before every case ran, when it did. */
  stoppedBy: z.string().max(80).nullable(),
  cases: z.array(solutionCheckCaseSchema).max(50),
});
export type SolutionCheckSolution = z.infer<typeof solutionCheckSolutionSchema>;

export const solutionCheckResultSchema = z.object({
  version: z.literal(1),
  solutions: z.array(solutionCheckSolutionSchema).max(10),
  /** Set when the check could not run at all. */
  failureReason: z.string().max(80).nullable(),
});
export type SolutionCheckResult = z.infer<typeof solutionCheckResultSchema>;

export const solutionCheckSchema = z.object({
  materialId: z.uuid(),
  status: solutionCheckStatusSchema,
  /** False when the problem's grading changed after this check was queued. */
  current: z.boolean(),
  queuedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  result: solutionCheckResultSchema.nullable(),
});
export type SolutionCheck = z.infer<typeof solutionCheckSchema>;

/** What the course content list needs: one entry per checked problem. */
export const solutionCheckSummarySchema = z.object({
  materialId: z.uuid(),
  status: solutionCheckStatusSchema,
  failedPositions: z.array(z.number().int().positive()).max(50),
});
export type SolutionCheckSummary = z.infer<typeof solutionCheckSummarySchema>;

export const solutionCheckInputSchema = courseIdInputSchema.extend({
  materialId: z.uuid(),
});
