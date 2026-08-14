import { z } from "zod";

import { sortDirectionSchema, sortDirections, type SortDirection } from "./answer-records.js";
import {
  overviewAttentionKinds,
  overviewAttentionKindSchema,
  type OverviewAttentionKind,
  overviewAttentionReasonSchema,
  overviewFilterOptionSchema,
  overviewCourseOptionSchema,
  overviewPeriodSchema,
  overviewRangeSchema,
} from "./teacher-overview.js";

/**
 * The teacher's Student analytics table: what a row is, and what decides its
 * position in one.
 *
 * The whole file exists to make one property true — that `Order` describes the
 * complete filtered result rather than the page in front of the reader. §7.3
 * requires the sort and the paging to be the server's, and a comparator that
 * lives here rather than in SQL is one that can be tested at its ties without a
 * database. The row shape and the comparators travel together for the same
 * reason: a column the table can sort by is a column the server knows how to
 * break a tie on.
 *
 * `Order` is contextual and is never stored. It changes the moment a filter
 * changes, which is exactly why §4 permits it: it is a teacher's current view
 * of their current scope, not a rank a child carries around.
 *
 * See §5.4, §7.2, §7.3, and §7.4 of the teacher overview and student analytics
 * redesign.
 */

const labelSchema = z.string().trim().min(1).max(200);
const percentSchema = z.number().int().min(0).max(100);
const countSchema = z.number().int().nonnegative();

/** §10.2 — the server pages; the browser never asks for the whole roster. */
export const STUDENT_PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_STUDENT_PAGE_SIZE = 25;
/** A search term longer than this is a paste, not a name. */
export const STUDENT_SEARCH_MAX_LENGTH = 80;

/* ------------------------------------------------------------------ sort */

export const studentSortKeys = [
  "score",
  "activeTime",
  "lastActive",
  "submissions",
  "solved",
  "name",
] as const;
export const studentSortKeySchema = z.enum(studentSortKeys);
export type StudentSortKey = z.infer<typeof studentSortKeySchema>;

/**
 * Reused rather than redeclared: Answer records already names this pair, and a
 * second `"asc" | "desc"` would be one more place for the two tables to drift.
 */
export { sortDirections, sortDirectionSchema, type SortDirection };

/**
 * The direction each column means when a teacher first clicks it.
 *
 * A name reads A–Z; every measurement reads best-first. Making the caller state
 * a default per column is what stops the table from opening on "the student
 * with the lowest score" the first time somebody sorts by score.
 */
export const defaultSortDirection: Record<StudentSortKey, SortDirection> = {
  score: "desc",
  activeTime: "desc",
  lastActive: "desc",
  submissions: "desc",
  solved: "desc",
  name: "asc",
};

/* ------------------------------------------------------------------- row */

export const teacherStudentRowSchema = z
  .object({
    /** §7.3 — offset + index + 1, over the whole filtered result. */
    order: z.number().int().positive(),
    membershipId: z.uuid(),
    displayName: labelSchema,
    /** Every selected class this student sits in. */
    classes: z.array(overviewFilterOptionSchema),
    /** The curriculum the measurements were taken over, in words. */
    courseScope: labelSchema.nullable(),
    /** Null, never zero, when nothing in scope was attempted. */
    averageScore: percentSchema.nullable(),
    attemptedProblems: countSchema,
    solvedProblems: countSchema,
    submissions: countSchema,
    activeSeconds: countSchema,
    activeDays: countSchema,
    lastActivityAt: z.iso.datetime().nullable(),
    /** Factual reasons, in reading order. Never a computed risk level. */
    reasons: z.array(overviewAttentionReasonSchema),
    /** Where `View progress` opens, or null when no class can hold it. */
    primaryClassId: z.uuid().nullable(),
  })
  .strict();
export type TeacherStudentRow = z.infer<typeof teacherStudentRowSchema>;

/**
 * What the comparators need, and nothing about presentation.
 *
 * Typed structurally rather than as `TeacherStudentRow` because ordering
 * happens before `order` exists — a comparator that required the field it is
 * there to produce would be impossible to call.
 */
export type StudentOrdering = {
  membershipId: string;
  displayName: string;
  averageScore: number | null;
  attemptedProblems: number;
  solvedProblems: number;
  submissions: number;
  activeSeconds: number;
  activeDays: number;
  lastActivityAt: string | null;
};

function seenAt(row: StudentOrdering): number {
  return row.lastActivityAt ? Date.parse(row.lastActivityAt) : 0;
}

/**
 * The §7.3 comparators, one per sortable column.
 *
 * Every one of them ends at the membership id, so the order is total: two
 * students who match on every measurement still have exactly one correct
 * position, and page 2 cannot repeat or skip a row that page 1 already placed.
 *
 * Each is written best-first. `direction` reverses the whole chain below,
 * including the tiebreakers, so ascending is genuinely the mirror of descending
 * rather than a differently-ordered list that happens to start at the other
 * end.
 */
const comparators: Record<
  StudentSortKey,
  (left: StudentOrdering, right: StudentOrdering) => number
> = {
  score: (left, right) =>
    // §7.3 — a student with no scored attempt sorts after every scored one, in
    // both directions. They are not the lowest scorer; they have no score.
    (right.averageScore ?? -1) - (left.averageScore ?? -1) ||
    right.attemptedProblems - left.attemptedProblems ||
    right.solvedProblems - left.solvedProblems ||
    seenAt(right) - seenAt(left) ||
    left.membershipId.localeCompare(right.membershipId),
  activeTime: (left, right) =>
    right.activeSeconds - left.activeSeconds ||
    right.activeDays - left.activeDays ||
    seenAt(right) - seenAt(left) ||
    left.membershipId.localeCompare(right.membershipId),
  lastActive: (left, right) =>
    seenAt(right) - seenAt(left) ||
    right.activeSeconds - left.activeSeconds ||
    left.membershipId.localeCompare(right.membershipId),
  submissions: (left, right) =>
    right.submissions - left.submissions ||
    right.solvedProblems - left.solvedProblems ||
    seenAt(right) - seenAt(left) ||
    left.membershipId.localeCompare(right.membershipId),
  solved: (left, right) =>
    right.solvedProblems - left.solvedProblems ||
    right.attemptedProblems - left.attemptedProblems ||
    seenAt(right) - seenAt(left) ||
    left.membershipId.localeCompare(right.membershipId),
  name: (left, right) =>
    left.displayName.localeCompare(right.displayName) ||
    left.membershipId.localeCompare(right.membershipId),
};

/**
 * The whole filtered result, in one deterministic order.
 *
 * Sorting the complete set and slicing afterwards is what makes `Order` mean
 * what §7.3 says it means. Sorting a page would produce a column that renumbers
 * itself every time a teacher turns the page.
 */
export function sortStudents<T extends StudentOrdering>(
  rows: T[],
  sort: StudentSortKey,
  direction: SortDirection,
): T[] {
  const compare = comparators[sort];
  const sign = direction === defaultSortDirection[sort] ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort === "score") {
      const leftMissing = left.averageScore === null;
      const rightMissing = right.averageScore === null;
      // Null placement is not a direction. No score is no evidence, so it
      // follows every measured score whether the teacher reads high-to-low or
      // low-to-high.
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    }
    return sign * compare(left, right);
  });
}

/** §7.3 — the teacher's contextual position, from the offset alone. */
export function orderNumbers(input: {
  page: number;
  pageSize: number;
  rows: number;
}): number[] {
  const offset = (input.page - 1) * input.pageSize;
  return Array.from({ length: input.rows }, (_, index) => offset + index + 1);
}

/**
 * The page a teacher can actually be on.
 *
 * Narrowing a filter can strip the page out from under a deep link, and a
 * request for page 9 of a 2-page result should show page 2 rather than an empty
 * table that reads as "no students match".
 */
export function clampPage(input: {
  page: number;
  pageSize: number;
  totalRows: number;
}): { page: number; pageCount: number; offset: number } {
  const pageCount = Math.max(1, Math.ceil(input.totalRows / input.pageSize));
  const page = Math.min(Math.max(1, Math.floor(input.page)), pageCount);
  return { page, pageCount, offset: (page - 1) * input.pageSize };
}

/* --------------------------------------------------------------- filters */

/**
 * The attention filter: any of these reasons, or no filter at all.
 *
 * A set rather than one value, because "stalled or inactive" is a question a
 * teacher actually asks — those are the two reasons that mean "I have not seen
 * this child work", and being forced to look at them one at a time turns one
 * glance into two.
 *
 * Empty means every student, and it is the only thing empty can mean. There is
 * no separate "anyone flagged" value: the reasons are exhaustive, so selecting
 * all of them *is* that question, and one concept is better than two that
 * overlap.
 */
export const studentAttentionFilterSchema = z
  .array(overviewAttentionKindSchema)
  .max(overviewAttentionKinds.length);
export type StudentAttentionFilter = z.infer<
  typeof studentAttentionFilterSchema
>;

/** Whether a student's reasons satisfy the filter. */
export function matchesAttentionFilter(
  reasons: readonly { kind: OverviewAttentionKind }[],
  filter: StudentAttentionFilter,
): boolean {
  if (filter.length === 0) return true;
  return reasons.some((reason) => filter.includes(reason.kind));
}

/**
 * A curriculum option, carrying its parent so the browser can narrow without
 * asking what it is allowed to see.
 *
 * The server sends only authorized options. §5.4 — the client never infers
 * access; it only hides what the response already excluded.
 */
export const curriculumOptionSchema = z
  .object({
    value: z.uuid(),
    label: labelSchema,
    parentId: z.uuid().nullable(),
  })
  .strict();
export type CurriculumOption = z.infer<typeof curriculumOptionSchema>;

export const teacherStudentFiltersSchema = z
  .object({
    classes: z.array(overviewFilterOptionSchema),
    courses: z.array(overviewCourseOptionSchema),
    /** Parent is the course. */
    modules: z.array(curriculumOptionSchema),
    /** Parent is the module. */
    lectures: z.array(curriculumOptionSchema),
    /** Parent is the lecture. */
    problems: z.array(curriculumOptionSchema),
  })
  .strict();
export type TeacherStudentFilters = z.infer<typeof teacherStudentFiltersSchema>;

/**
 * The scope a response actually used, echoed back.
 *
 * Every id is nullable and every one of them may differ from what the request
 * asked for: §5.4 drops an unauthorized or incompatible descendant rather than
 * refusing the read, and the page reads this to canonicalize its own address.
 */
export const teacherStudentScopeSchema = z
  .object({
    academyId: z.uuid(),
    classId: z.uuid().nullable(),
    courseId: z.uuid().nullable(),
    moduleId: z.uuid().nullable(),
    lectureId: z.uuid().nullable(),
    problemId: z.uuid().nullable(),
    /** The narrowest selected curriculum, in words, for the table caption. */
    curriculumLabel: labelSchema.nullable(),
    /** Visible problems the scope contains — the score's denominator ceiling. */
    scopedProblems: countSchema,
    period: overviewPeriodSchema,
    activityTrackedSince: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    generatedAt: z.iso.datetime(),
  })
  .strict();
export type TeacherStudentScope = z.infer<typeof teacherStudentScopeSchema>;

/* -------------------------------------------------------------- the list */

export const teacherStudentListSchema = z
  .object({
    scope: teacherStudentScopeSchema,
    filters: teacherStudentFiltersSchema,
    rows: z.array(teacherStudentRowSchema),
    /** Students matching the filters, not students on this page. */
    totalRows: countSchema,
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    pageCount: z.number().int().positive(),
    sort: studentSortKeySchema,
    direction: sortDirectionSchema,
    search: z.string(),
    attention: studentAttentionFilterSchema,
  })
  .strict();
export type TeacherStudentList = z.infer<typeof teacherStudentListSchema>;

export const listAcademyStudentsInputSchema = z.object({
  academyId: z.uuid(),
  classId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  moduleId: z.uuid().optional(),
  lectureId: z.uuid().optional(),
  problemId: z.uuid().optional(),
  range: overviewRangeSchema.optional(),
  search: z.string().max(STUDENT_SEARCH_MAX_LENGTH).optional(),
  attention: studentAttentionFilterSchema.optional(),
  sort: studentSortKeySchema.optional(),
  direction: sortDirectionSchema.optional(),
  page: z.number().int().positive().max(10_000).optional(),
  pageSize: z
    .number()
    .int()
    .refine(
      (value): value is (typeof STUDENT_PAGE_SIZES)[number] =>
        (STUDENT_PAGE_SIZES as readonly number[]).includes(value),
      { message: "unsupported page size" },
    )
    .optional(),
});
export type ListAcademyStudentsInput = z.infer<
  typeof listAcademyStudentsInputSchema
>;
