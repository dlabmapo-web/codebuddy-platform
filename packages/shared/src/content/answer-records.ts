import { z } from "zod";

import type { SubmissionStatus } from "./submission.js";

/**
 * The student's own answer history, as the records page reads it.
 *
 * Two disclosure rules are structural here, the same way they are in
 * `learn.ts`. A row has nowhere to put source code — code is fetched only for
 * the one authorized workspace bootstrap — and nothing in this file can hold a
 * hidden test input, expected output, or actual output, because the only
 * verdict shape it re-exports is the already student-safe
 * `submissionResultSchema`.
 *
 * See §10 of the student answer records design.
 */

const labelSchema = z.string().trim().min(1).max(200);
/** Zero is reachable: an orphaned pre-migration row is backfilled with it. */
const outlinePositionSchema = z.number().int().nonnegative();

/**
 * A verdict as a student may name it.
 *
 * Deliberately not `SubmissionStatus`. A judge fault is not a wrong answer and
 * must never be filtered, counted, or badged as one, and `QUEUED` versus
 * `RUNNING` is a fact about the queue rather than about the attempt. Mapping
 * once, here, is what keeps the badge, the facet, and the summary metrics from
 * growing three different ideas of what "not accepted" means.
 */
export const answerRecordResults = [
  "ACCEPTED",
  "NOT_ACCEPTED",
  "JUDGE_ERROR",
  "CANCELLED",
  "IN_PROGRESS",
] as const;
export const answerRecordResultSchema = z.enum(answerRecordResults);
export type AnswerRecordResult = z.infer<typeof answerRecordResultSchema>;

export function answerRecordResultFor(
  status: SubmissionStatus,
): AnswerRecordResult {
  switch (status) {
    case "PASSED":
      return "ACCEPTED";
    case "FAILED":
      return "NOT_ACCEPTED";
    case "ERRORED":
      return "JUDGE_ERROR";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "IN_PROGRESS";
  }
}

/** The inverse, for turning a chosen facet back into a database predicate. */
export function submissionStatusesFor(
  result: AnswerRecordResult,
): SubmissionStatus[] {
  switch (result) {
    case "ACCEPTED":
      return ["PASSED"];
    case "NOT_ACCEPTED":
      return ["FAILED"];
    case "JUDGE_ERROR":
      return ["ERRORED"];
    case "CANCELLED":
      return ["CANCELLED"];
    default:
      return ["QUEUED", "RUNNING"];
  }
}

/**
 * One attempt, as one table row.
 *
 * `.strict()` is the guarantee rather than a convenience: a service that
 * selects too much fails at the boundary instead of quietly shipping a column
 * nobody meant to publish.
 */
export const answerRecordRowSchema = z
  .object({
    submissionId: z.uuid(),
    /** The exercise this attempt was made against, for the Review link. */
    materialId: z.uuid(),
    /** Frozen at submission time — see §9 of the design. */
    problemTitle: labelSchema,
    courseTitle: labelSchema,
    moduleTitle: labelSchema,
    lectureTitle: labelSchema,
    modulePosition: outlinePositionSchema,
    lecturePosition: outlinePositionSchema,
    problemPosition: outlinePositionSchema,
    result: answerRecordResultSchema,
    score: z.number().int().min(0).max(100),
    passedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().nonnegative(),
    /** Null for rows written before solve sessions existed. */
    solveElapsedSec: z.number().int().nonnegative().nullable(),
    createdAt: z.iso.datetime(),
    /**
     * Whether the problem is still reachable through current learning
     * authorization. History never recreates access it no longer grants.
     */
    canOpenExercise: z.boolean(),
  })
  .strict();
export type AnswerRecordRow = z.infer<typeof answerRecordRowSchema>;

/**
 * Whole-history metrics, unaffected by the table's own filters.
 *
 * Stable while filtering is the point: narrowing the table must not make a
 * student's overall progress appear to change.
 */
export const answerRecordSummarySchema = z
  .object({
    /** `PASSED` and `FAILED` only — a judge fault is not a student attempt. */
    totalSubmissions: z.number().int().nonnegative(),
    solvedProblems: z.number().int().nonnegative(),
    /** Whole percent, 0-100. Zero when nothing has been attempted. */
    acceptedRate: z.number().int().min(0).max(100),
  })
  .strict();
export type AnswerRecordSummary = z.infer<typeof answerRecordSummarySchema>;

export const answerRecordFacetOptionSchema = z
  .object({ value: z.string().min(1), label: labelSchema })
  .strict();
export type AnswerRecordFacetOption = z.infer<
  typeof answerRecordFacetOptionSchema
>;

/**
 * The options the server says exist in this academy scope.
 *
 * Counts are deliberately absent. In manual mode the browser holds one page of
 * rows, and a count derived from it would describe that page while appearing
 * to describe the whole history.
 */
export const answerRecordFacetsSchema = z
  .object({
    results: z.array(answerRecordResultSchema),
    classes: z.array(answerRecordFacetOptionSchema),
    courses: z.array(answerRecordFacetOptionSchema),
    modules: z.array(answerRecordFacetOptionSchema),
    lectures: z.array(answerRecordFacetOptionSchema),
  })
  .strict();
export type AnswerRecordFacets = z.infer<typeof answerRecordFacetsSchema>;

export const answerRecordSortKeys = [
  "problem",
  "result",
  "score",
  "solveTime",
  "submitted",
] as const;
export const answerRecordSortSchema = z.enum(answerRecordSortKeys);
export type AnswerRecordSort = z.infer<typeof answerRecordSortSchema>;

export const sortDirections = ["asc", "desc"] as const;
export const sortDirectionSchema = z.enum(sortDirections);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/** Fixed. v2 has no page-size selector — see §4 of the design. */
export const ANSWER_RECORDS_PAGE_SIZE = 20;

/** Long enough for a real search, short enough that it cannot be a payload. */
export const ANSWER_RECORDS_SEARCH_MAX = 120;

export const listAnswerRecordsInputSchema = z.object({
  academyId: z.uuid(),
  q: z.string().trim().max(ANSWER_RECORDS_SEARCH_MAX).optional(),
  results: z.array(answerRecordResultSchema).optional(),
  classIds: z.array(z.uuid()).optional(),
  courseIds: z.array(z.uuid()).optional(),
  moduleIds: z.array(z.uuid()).optional(),
  lectureIds: z.array(z.uuid()).optional(),
  sort: answerRecordSortSchema.optional(),
  direction: sortDirectionSchema.optional(),
  page: z.number().int().positive().optional(),
});
export type ListAnswerRecordsInput = z.infer<
  typeof listAnswerRecordsInputSchema
>;

export const answerRecordsPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.literal(ANSWER_RECORDS_PAGE_SIZE),
    totalCount: z.number().int().nonnegative(),
    pageCount: z.number().int().nonnegative(),
  })
  .strict();

export const answerRecordsResultSchema = z
  .object({
    summary: answerRecordSummarySchema,
    rows: z.array(answerRecordRowSchema),
    facets: answerRecordFacetsSchema,
    pagination: answerRecordsPaginationSchema,
  })
  .strict();
export type AnswerRecordsResult = z.infer<typeof answerRecordsResultSchema>;

/* ------------------------------------------------------- solve sessions */

/**
 * Bounds an accidentally abandoned tab. A student who left a problem open
 * overnight did not spend the night solving it, and storing that as study time
 * would make the column worthless.
 */
export const SOLVE_SESSION_MAX_SECONDS = 24 * 60 * 60;

export const solveSessionSchema = z
  .object({
    solveSessionId: z.uuid(),
    startedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type SolveSession = z.infer<typeof solveSessionSchema>;

/**
 * Elapsed seconds from a session origin, capped.
 *
 * Server-owned: the browser names the session and nothing else, so a patched
 * client cannot report an impressive solve time.
 */
export function solveElapsedSeconds(
  startedAt: Date | string,
  now: Date | string,
): number {
  const elapsed = Math.floor(
    (new Date(now).getTime() - new Date(startedAt).getTime()) / 1_000,
  );
  return Math.min(SOLVE_SESSION_MAX_SECONDS, Math.max(0, elapsed));
}

export function isSolveSessionExpired(
  startedAt: Date | string,
  now: Date | string,
): boolean {
  return (
    (new Date(now).getTime() - new Date(startedAt).getTime()) / 1_000 >=
    SOLVE_SESSION_MAX_SECONDS
  );
}

/**
 * A duration split for display, or nothing when it was never recorded.
 *
 * Returns parts rather than text: the record table, the workspace clock, and
 * the accessible label all describe the same duration in different words, and
 * only the caller knows which locale strings it holds.
 */
export function solveDurationParts(
  totalSeconds: number | null,
): { hours: number; minutes: number; seconds: number } | null {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return null;
  const capped = Math.min(
    SOLVE_SESSION_MAX_SECONDS,
    Math.max(0, Math.floor(totalSeconds)),
  );
  return {
    hours: Math.floor(capped / 3_600),
    minutes: Math.floor((capped % 3_600) / 60),
    seconds: capped % 60,
  };
}

/* ------------------------------------------------------------ pure logic */

/**
 * The accepted rate as a whole percent.
 *
 * Judge faults and cancelled work are excluded by the caller before they
 * arrive here: a system failure must not move a student's numbers.
 */
export function acceptedRate(input: {
  accepted: number;
  notAccepted: number;
}): number {
  const denominator = input.accepted + input.notAccepted;
  if (denominator <= 0) return 0;
  return Math.round((input.accepted / denominator) * 100);
}

/**
 * Which page a request actually lands on.
 *
 * A page beyond the end canonicalizes to the last one with results, and to the
 * first when there are none — a bookmarked page 9 of a filtered history shows
 * rows rather than an empty table nobody can explain.
 */
export function resolveRecordsPage(input: {
  requestedPage: number;
  totalCount: number;
  pageSize?: number;
}): { page: number; pageCount: number; skip: number } {
  const pageSize = input.pageSize ?? ANSWER_RECORDS_PAGE_SIZE;
  const pageCount = Math.ceil(Math.max(0, input.totalCount) / pageSize);
  const page = Math.min(Math.max(1, input.requestedPage), Math.max(1, pageCount));
  return { page, pageCount, skip: (page - 1) * pageSize };
}

/**
 * The outline number a record prints, matching the course outline's own.
 *
 * A row backfilled with zero positions has no place in the outline, so it
 * prints nothing rather than a `0-0-0` that looks like a real coordinate.
 */
export function answerRecordOutlineNumber(row: {
  modulePosition: number;
  lecturePosition: number;
  problemPosition: number;
}): string | null {
  if (
    row.modulePosition <= 0 ||
    row.lecturePosition <= 0 ||
    row.problemPosition <= 0
  ) {
    return null;
  }
  return `${row.modulePosition}-${row.lecturePosition}-${row.problemPosition}`;
}
