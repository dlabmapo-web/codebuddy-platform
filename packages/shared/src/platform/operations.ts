import { z } from "zod";

import { academySlugSchema } from "./academy.js";

/**
 * Maintenance work an operator dispatches, and the record of what it did.
 *
 * The console's other platform surfaces answer questions. This one *acts*, on
 * machinery that already runs in production and until now had no interface but
 * a terminal on the server. Everything here is therefore shaped around one
 * property: an operator must know what a button will do before pressing it, and
 * must be able to find out what it did afterwards.
 *
 * ## Why a run is a first-class thing
 *
 * A queue knows a job ran. It does not know that a person pressed a button,
 * what they were looking at, what the blast radius was when they confirmed, or
 * whether the thing they were repairing is now repaired. `OperationRun` is that
 * record, and it is why this contract has five procedures rather than one.
 */

export const platformOperationSchema = z.enum(["REGRADE_STALE_SUBMISSIONS"]);
export type PlatformOperationName = z.infer<typeof platformOperationSchema>;

export const platformOperationStatusSchema = z.enum([
  "PLANNING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);
export type PlatformOperationStatus = z.infer<
  typeof platformOperationStatusSchema
>;

/** A run is settled when nothing further will happen to it on its own. */
export function isSettledOperationStatus(
  status: PlatformOperationStatus,
): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

/**
 * One problem whose grading moved on without its submissions.
 *
 * The board an operator reads before anybody reports anything. `staleCount` and
 * `studentCount` are the same numbers the confirmation dialog will show, read
 * by the same predicate, so the page cannot promise one thing and the operation
 * do another.
 */
export const staleProblemRowSchema = z
  .object({
    materialId: z.uuid(),
    problemTitle: z.string(),
    courseId: z.uuid(),
    courseTitle: z.string(),
    /** Where the problem sits, for an operator matching it to a teacher's report. */
    moduleTitle: z.string(),
    lectureTitle: z.string(),
    currentRevision: z.number().int().positive(),
    staleCount: z.number().int().nonnegative(),
    studentCount: z.number().int().nonnegative(),
    /** Set while a run against this problem is planning or running. */
    inFlightRunId: z.uuid().nullable(),
  })
  .strict();
export type StaleProblemRow = z.infer<typeof staleProblemRowSchema>;

/** How many stale problems one board will show before it says so. */
export const STALE_PROBLEMS_MAX = 200;

export const staleProblemBoardSchema = z
  .object({
    rows: z.array(staleProblemRowSchema),
    academyId: z.uuid(),
    /**
     * More problems are stale than this board is showing.
     *
     * An academy that bulk-imported a curriculum can bump every revision at
     * once, and a board that quietly showed the first two hundred would let an
     * operator believe they had finished. Reported rather than paged: the rows
     * are filtered and searched in the browser, and paging them would mean the
     * search box only searched the page you were on.
     */
    truncated: z.boolean(),
  })
  .strict();
export type StaleProblemBoard = z.infer<typeof staleProblemBoardSchema>;

export const listStaleProblemsInputSchema = z
  .object({ academyId: z.uuid() })
  .strict();
export type ListStaleProblemsInput = z.infer<
  typeof listStaleProblemsInputSchema
>;

export const planRegradeInputSchema = z
  .object({ academyId: z.uuid(), materialId: z.uuid() })
  .strict();
export type PlanRegradeInput = z.infer<typeof planRegradeInputSchema>;

/**
 * What the operator is being asked to agree to.
 *
 * Returned before anything is dispatched. A plan with `plannedCount: 0` is a
 * complete answer — it means the problem is not the one the teacher meant — and
 * the console says so rather than offering a button that would do nothing.
 */
export const regradePlanSchema = z
  .object({
    runId: z.uuid(),
    materialId: z.uuid(),
    problemTitle: z.string(),
    currentRevision: z.number().int().positive(),
    plannedCount: z.number().int().nonnegative(),
    studentCount: z.number().int().nonnegative(),
  })
  .strict();
export type RegradePlan = z.infer<typeof regradePlanSchema>;

export const startRegradeInputSchema = z.object({ runId: z.uuid() }).strict();
export type StartRegradeInput = z.infer<typeof startRegradeInputSchema>;

export const operationRunSchema = z
  .object({
    id: z.uuid(),
    academyId: z.uuid(),
    academySlug: academySlugSchema,
    academyName: z.string(),
    operation: platformOperationSchema,
    targetType: z.string(),
    targetId: z.string(),
    /** The problem's title as it reads now, or null if it has been deleted. */
    targetTitle: z.string().nullable(),
    actorName: z.string(),
    status: platformOperationStatusSchema,
    plannedCount: z.number().int().nonnegative(),
    studentCount: z.number().int().nonnegative(),
    dispatchedCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    failureReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type OperationRun = z.infer<typeof operationRunSchema>;

export const readOperationRunInputSchema = z
  .object({ runId: z.uuid() })
  .strict();
export type ReadOperationRunInput = z.infer<typeof readOperationRunInputSchema>;

export const OPERATION_RUNS_PAGE_MAX = 50;

export const listOperationRunsInputSchema = z
  .object({
    /** Absent means every academy — the console's own history. */
    academyId: z.uuid().optional(),
    limit: z.number().int().min(1).max(OPERATION_RUNS_PAGE_MAX).default(20),
  })
  .strict();
export type ListOperationRunsInput = z.infer<
  typeof listOperationRunsInputSchema
>;

export const operationRunListSchema = z
  .object({ runs: z.array(operationRunSchema) })
  .strict();
export type OperationRunList = z.infer<typeof operationRunListSchema>;

/**
 * How far a run has got, as one fraction.
 *
 * Kept here rather than in the web package because the same arithmetic decides
 * whether a run is finished and what the page says about it, and two copies
 * would eventually disagree about a run that dispatched nothing.
 */
export function operationRunProgress(run: {
  status: PlatformOperationStatus;
  plannedCount: number;
  dispatchedCount: number;
  completedCount: number;
  failedCount: number;
}): { settled: number; total: number; ratio: number } {
  const settled = run.completedCount + run.failedCount;
  const total = Math.max(run.dispatchedCount, 0);
  // A run that planned nothing is complete, not zero percent complete. The
  // difference matters: a progress bar stuck at 0 reads as broken.
  if (total === 0) return { settled: 0, total: 0, ratio: 1 };
  return { settled, total, ratio: Math.min(1, settled / total) };
}
