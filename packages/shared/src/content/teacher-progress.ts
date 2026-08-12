import { z } from "zod";

import { exerciseDifficultySchema } from "./course.js";
import { caseOutcomeSchema } from "./submission.js";
import { sortDirectionSchema } from "./answer-records.js";

/**
 * What an assigned teacher may read about one class's solutions.
 *
 * Three rules are structural here rather than remembered.
 *
 * Nothing in this file has anywhere to put source code except
 * `teacherSubmissionReviewSchema`, which is reached by exactly one operation.
 * Nothing here can hold a hidden test input, expected output, or actual
 * output — a hidden case is a position and an outcome and nothing else. And
 * every student is named by class membership id, never by user id, so the
 * browser cannot address a person the class enrollment does not scope.
 *
 * See §6, §7, and §11 of the teacher solution status design.
 */

const labelSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(2_000);
/** Zero is reachable: a pre-migration submission is backfilled with it. */
const outlinePositionSchema = z.number().int().nonnegative();
const percentSchema = z.number().int().min(0).max(100);
const countSchema = z.number().int().nonnegative();

/* ------------------------------------------------------------- attention */

/**
 * Thresholds, named once.
 *
 * They are constants rather than settings in this version: an academy that
 * can tune "repeated" would make two classes disagree about what the same
 * word means, and §4 rules configuration out until the vocabulary has settled.
 */
export const REPEATED_FAILURE_ATTEMPTS = 3;
export const STALLED_AFTER_DAYS = 7;
export const LONG_SOLVE_SECONDS = 1_800;

export const teacherAttentionKinds = [
  "repeated_failures",
  "stalled",
  "long_solve",
] as const;
export const teacherAttentionKindSchema = z.enum(teacherAttentionKinds);
export type TeacherAttentionKind = z.infer<typeof teacherAttentionKindSchema>;

/**
 * One reason, carrying the number that produced it.
 *
 * The measurement travels with the reason so the interface can say "failed 5
 * times in a row" rather than "needs attention". §7.4 makes that the whole
 * point: a signal a teacher cannot explain to a student is not a signal, and
 * a bare severity would be a score by another name.
 */
export const teacherAttentionReasonSchema = z
  .object({
    kind: teacherAttentionKindSchema,
    /**
     * `repeated_failures` → consecutive failed attempts.
     * `stalled` → whole days since the last attempt.
     * `long_solve` → measured seconds on the latest failed attempt.
     */
    value: countSchema,
  })
  .strict();
export type TeacherAttentionReason = z.infer<
  typeof teacherAttentionReasonSchema
>;

/* --------------------------------------------------------------- filters */

export const teacherProgressStatuses = [
  "not_started",
  "in_progress",
  "solved",
] as const;
export const teacherProgressStatusSchema = z.enum(teacherProgressStatuses);
export type TeacherProgressStatus = z.infer<typeof teacherProgressStatusSchema>;

export const teacherStudentSortKeys = [
  "student",
  "completion",
  "attempts",
  "accepted",
  "lastActivity",
  "attention",
] as const;
export const teacherStudentSortSchema = z.enum(teacherStudentSortKeys);
export type TeacherStudentSort = z.infer<typeof teacherStudentSortSchema>;

/** Fixed page sizes. §8.1 and §8.2 — v2 has no page-size selector. */
export const TEACHER_ROSTER_PAGE_SIZE = 25;
export const TEACHER_EXERCISE_PAGE_SIZE = 25;
export const TEACHER_ATTEMPTS_PAGE_SIZE = 20;
export const TEACHER_PROBLEM_STUDENTS_PAGE_SIZE = 25;

/** Long enough for a real name or problem title, short enough to bound SQL. */
export const TEACHER_PROGRESS_SEARCH_MAX = 120;

const searchSchema = z.string().trim().max(TEACHER_PROGRESS_SEARCH_MAX);

/* ---------------------------------------------------------- shared parts */

export const teacherProgressPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalCount: countSchema,
    pageCount: countSchema,
  })
  .strict();
export type TeacherProgressPagination = z.infer<
  typeof teacherProgressPaginationSchema
>;

export const teacherProgressOptionSchema = z
  .object({ value: z.string().min(1), label: labelSchema })
  .strict();
export type TeacherProgressOption = z.infer<typeof teacherProgressOptionSchema>;

/**
 * The options the server says this class has.
 *
 * Counts are absent for the same reason they are in Answer records: the
 * browser holds one page, and a count derived from it would describe that page
 * while appearing to describe the class.
 */
export const teacherProgressFacetsSchema = z
  .object({
    courses: z.array(teacherProgressOptionSchema),
    statuses: z.array(teacherProgressStatusSchema),
    attention: z.array(teacherAttentionKindSchema),
  })
  .strict();
export type TeacherProgressFacets = z.infer<typeof teacherProgressFacetsSchema>;

/**
 * The three facts the page opens with.
 *
 * Completion is a pair count, not an average of per-student percentages: a
 * class where one student finished everything and nine started nothing is 10%
 * done, and averaging percentages would say the same thing only by accident.
 */
export const teacherClassProgressSummarySchema = z
  .object({
    classId: z.uuid(),
    className: labelSchema,
    activeStudents: countSchema,
    solvedPairs: countSchema,
    eligiblePairs: countSchema,
    completionPercent: percentSchema,
    studentsNeedingAttention: countSchema,
  })
  .strict();
export type TeacherClassProgressSummary = z.infer<
  typeof teacherClassProgressSummarySchema
>;

/* ---------------------------------------------------------- by student */

export const teacherStudentProgressRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    solvedProblems: countSchema,
    eligibleProblems: countSchema,
    completionPercent: percentSchema,
    attempts: countSchema,
    acceptedPercent: percentSchema,
    lastActivityAt: z.iso.datetime().nullable(),
    /** Distinct exercises currently producing at least one reason. */
    attentionCount: countSchema,
    /** The distinct kinds behind that count, for the row's chips. */
    attentionKinds: z.array(teacherAttentionKindSchema),
  })
  .strict();
export type TeacherStudentProgressRow = z.infer<
  typeof teacherStudentProgressRowSchema
>;

export const teacherStudentsResultSchema = z
  .object({
    summary: teacherClassProgressSummarySchema,
    rows: z.array(teacherStudentProgressRowSchema),
    facets: teacherProgressFacetsSchema,
    pagination: teacherProgressPaginationSchema,
  })
  .strict();
export type TeacherStudentsResult = z.infer<typeof teacherStudentsResultSchema>;

/**
 * One exercise, as one line of a student's detail.
 *
 * `isRequired` travels with the row because an optional exercise is shown but
 * excluded from the denominator — without the flag the table would look like
 * it is contradicting the completion figure above it.
 */
export const teacherStudentExerciseRowSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    courseTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    difficulty: exerciseDifficultySchema,
    isRequired: z.boolean(),
    status: teacherProgressStatusSchema,
    bestScore: percentSchema,
    attempts: countSchema,
    lastAttemptAt: z.iso.datetime().nullable(),
    attentionReasons: z.array(teacherAttentionReasonSchema),
  })
  .strict();
export type TeacherStudentExerciseRow = z.infer<
  typeof teacherStudentExerciseRowSchema
>;

export const teacherStudentProgressDetailSchema = z
  .object({
    student: teacherStudentProgressRowSchema,
    rows: z.array(teacherStudentExerciseRowSchema),
    facets: teacherProgressFacetsSchema,
    pagination: teacherProgressPaginationSchema,
  })
  .strict();
export type TeacherStudentProgressDetail = z.infer<
  typeof teacherStudentProgressDetailSchema
>;

/**
 * One immutable attempt, as the history list prints it.
 *
 * Frozen labels, no code: opening the code is a separate operation with its
 * own authorization, so a list can never become a bulk source-code export.
 */
export const teacherAttemptSummarySchema = z
  .object({
    submissionId: z.uuid(),
    accepted: z.boolean(),
    score: percentSchema,
    passedCount: countSchema,
    totalCount: countSchema,
    runtimeMs: countSchema.nullable(),
    solveElapsedSec: countSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type TeacherAttemptSummary = z.infer<typeof teacherAttemptSummarySchema>;

export const teacherAttemptsResultSchema = z
  .object({
    problemTitle: labelSchema,
    studentName: labelSchema,
    attempts: z.array(teacherAttemptSummarySchema),
    pagination: teacherProgressPaginationSchema,
  })
  .strict();
export type TeacherAttemptsResult = z.infer<typeof teacherAttemptsResultSchema>;

/* ---------------------------------------------------------- by problem */

export const teacherCourseProgressSummarySchema = z
  .object({
    courseId: z.uuid(),
    title: labelSchema,
    description: descriptionSchema,
    moduleCount: countSchema,
    exerciseCount: countSchema,
    solvedPairs: countSchema,
    eligiblePairs: countSchema,
    completionPercent: percentSchema,
    attentionCount: countSchema,
  })
  .strict();
export type TeacherCourseProgressSummary = z.infer<
  typeof teacherCourseProgressSummarySchema
>;

export const teacherCurriculumResultSchema = z
  .object({
    summary: teacherClassProgressSummarySchema,
    courses: z.array(teacherCourseProgressSummarySchema),
  })
  .strict();
export type TeacherCurriculumResult = z.infer<
  typeof teacherCurriculumResultSchema
>;

export const teacherLectureProgressSummarySchema = z
  .object({
    lectureId: z.uuid(),
    title: labelSchema,
    description: descriptionSchema,
    outlineNumber: z.string().max(24),
    problemCount: countSchema,
    solvedPairs: countSchema,
    eligiblePairs: countSchema,
    completionPercent: percentSchema,
    attentionCount: countSchema,
  })
  .strict();
export type TeacherLectureProgressSummary = z.infer<
  typeof teacherLectureProgressSummarySchema
>;

export const teacherModuleProgressSummarySchema = z
  .object({
    moduleId: z.uuid(),
    title: labelSchema,
    position: outlinePositionSchema,
    solvedPairs: countSchema,
    eligiblePairs: countSchema,
    completionPercent: percentSchema,
    attentionCount: countSchema,
    lectures: z.array(teacherLectureProgressSummarySchema),
  })
  .strict();
export type TeacherModuleProgressSummary = z.infer<
  typeof teacherModuleProgressSummarySchema
>;

export const teacherCourseOutlineResultSchema = z
  .object({
    course: teacherCourseProgressSummarySchema,
    modules: z.array(teacherModuleProgressSummarySchema),
  })
  .strict();
export type TeacherCourseOutlineResult = z.infer<
  typeof teacherCourseOutlineResultSchema
>;

export const teacherProblemProgressRowSchema = z
  .object({
    materialId: z.uuid(),
    title: labelSchema,
    outlineNumber: z.string().max(24),
    difficulty: exerciseDifficultySchema,
    isRequired: z.boolean(),
    studentsAttempted: countSchema,
    studentsSolved: countSchema,
    attempts: countSchema,
    solvedPercent: percentSchema,
    /** Null when no attempt on this problem ever measured a solve time. */
    medianSolveSec: countSchema.nullable(),
    attentionCount: countSchema,
  })
  .strict();
export type TeacherProblemProgressRow = z.infer<
  typeof teacherProblemProgressRowSchema
>;

export const teacherLectureProblemsResultSchema = z
  .object({
    lecture: teacherLectureProgressSummarySchema,
    rows: z.array(teacherProblemProgressRowSchema),
  })
  .strict();
export type TeacherLectureProblemsResult = z.infer<
  typeof teacherLectureProblemsResultSchema
>;

export const teacherProblemStudentRowSchema = z
  .object({
    membershipId: z.uuid(),
    displayName: labelSchema,
    status: teacherProgressStatusSchema,
    bestScore: percentSchema,
    attempts: countSchema,
    lastActivityAt: z.iso.datetime().nullable(),
    latestSolveElapsedSec: countSchema.nullable(),
    attentionReasons: z.array(teacherAttentionReasonSchema),
  })
  .strict();
export type TeacherProblemStudentRow = z.infer<
  typeof teacherProblemStudentRowSchema
>;

export const teacherProblemStudentsResultSchema = z
  .object({
    problem: teacherProblemProgressRowSchema,
    rows: z.array(teacherProblemStudentRowSchema),
    pagination: teacherProgressPaginationSchema,
  })
  .strict();
export type TeacherProblemStudentsResult = z.infer<
  typeof teacherProblemStudentsResultSchema
>;

/* ------------------------------------------------------ submission review */

/**
 * One graded case, as a teacher may read it.
 *
 * The same disclosure rule the student gets, and deliberately not a wider one:
 * a teacher who could read hidden inputs could hand them to a student, and
 * §4 keeps regrading and hidden data out of this feature entirely.
 */
export const teacherReviewCaseSchema = z
  .object({
    position: z.number().int().positive(),
    isSample: z.boolean(),
    outcome: caseOutcomeSchema,
    runtimeMs: countSchema.nullable(),
    /** Sample cases only. Structurally absent for hidden ones. */
    input: z.string().nullable(),
    expectedOutput: z.string().nullable(),
    actualOutput: z.string().nullable(),
  })
  .strict();
export type TeacherReviewCase = z.infer<typeof teacherReviewCaseSchema>;

export const teacherSubmissionReviewSchema = z
  .object({
    submissionId: z.uuid(),
    membershipId: z.uuid(),
    studentName: labelSchema,
    /** Frozen at submission time: history stays readable after a rename. */
    problemTitle: labelSchema,
    courseTitle: labelSchema,
    moduleTitle: labelSchema,
    lectureTitle: labelSchema,
    outlineNumber: z.string().max(24).nullable(),
    accepted: z.boolean(),
    score: percentSchema,
    passedCount: countSchema,
    totalCount: countSchema,
    runtimeMs: countSchema.nullable(),
    solveElapsedSec: countSchema.nullable(),
    createdAt: z.iso.datetime(),
    /** The immutable submitted code. The one place it is ever selected. */
    code: z.string(),
    language: z.string().min(1).max(40),
    /** Current statement for context, or null when it is no longer available. */
    statement: z.string().nullable(),
    cases: z.array(teacherReviewCaseSchema),
    hiddenPassed: countSchema,
    hiddenTotal: countSchema,
  })
  .strict();
export type TeacherSubmissionReview = z.infer<
  typeof teacherSubmissionReviewSchema
>;

/* ---------------------------------------------------------------- inputs */

/** Every operation is class-scoped; there is no academy-wide teacher read. */
const classScopeShape = { academyId: z.uuid(), classId: z.uuid() };

export const teacherProgressCurriculumFilterShape = {
  courseIds: z.array(z.uuid()).max(50).optional(),
  moduleId: z.uuid().optional(),
  lectureId: z.uuid().optional(),
  statuses: z.array(teacherProgressStatusSchema).optional(),
  attention: z.array(teacherAttentionKindSchema).optional(),
  q: searchSchema.optional(),
};

export const listTeacherStudentsInputSchema = z.object({
  ...classScopeShape,
  ...teacherProgressCurriculumFilterShape,
  sort: teacherStudentSortSchema.optional(),
  direction: sortDirectionSchema.optional(),
  page: z.number().int().positive().optional(),
});
export type ListTeacherStudentsInput = z.infer<
  typeof listTeacherStudentsInputSchema
>;

export const getTeacherStudentDetailInputSchema = z.object({
  ...classScopeShape,
  ...teacherProgressCurriculumFilterShape,
  membershipId: z.uuid(),
  page: z.number().int().positive().optional(),
});
export type GetTeacherStudentDetailInput = z.infer<
  typeof getTeacherStudentDetailInputSchema
>;

export const listTeacherAttemptsInputSchema = z.object({
  ...classScopeShape,
  membershipId: z.uuid(),
  materialId: z.uuid(),
  page: z.number().int().positive().optional(),
});
export type ListTeacherAttemptsInput = z.infer<
  typeof listTeacherAttemptsInputSchema
>;

export const listTeacherCurriculumInputSchema = z.object({
  ...classScopeShape,
  q: searchSchema.optional(),
  courseIds: z.array(z.uuid()).max(50).optional(),
});
export type ListTeacherCurriculumInput = z.infer<
  typeof listTeacherCurriculumInputSchema
>;

export const listTeacherCourseOutlineInputSchema = z.object({
  ...classScopeShape,
  courseId: z.uuid(),
  q: searchSchema.optional(),
});
export type ListTeacherCourseOutlineInput = z.infer<
  typeof listTeacherCourseOutlineInputSchema
>;

export const listTeacherLectureProblemsInputSchema = z.object({
  ...classScopeShape,
  lectureId: z.uuid(),
});
export type ListTeacherLectureProblemsInput = z.infer<
  typeof listTeacherLectureProblemsInputSchema
>;

export const listTeacherProblemStudentsInputSchema = z.object({
  ...classScopeShape,
  materialId: z.uuid(),
  page: z.number().int().positive().optional(),
});
export type ListTeacherProblemStudentsInput = z.infer<
  typeof listTeacherProblemStudentsInputSchema
>;

export const getTeacherSubmissionReviewInputSchema = z.object({
  ...classScopeShape,
  membershipId: z.uuid(),
  submissionId: z.uuid(),
});
export type GetTeacherSubmissionReviewInput = z.infer<
  typeof getTeacherSubmissionReviewInputSchema
>;

/* ------------------------------------------------------------ pure logic */

/**
 * Solved over eligible, as a whole percent.
 *
 * Zero when nothing is eligible. A class with no graded curriculum is not
 * 100% complete, and reporting it that way would tell a teacher their students
 * had finished work that does not exist.
 */
export function completionPercent(input: {
  solved: number;
  eligible: number;
}): number {
  if (input.eligible <= 0) return 0;
  const solved = Math.max(0, Math.min(input.solved, input.eligible));
  return Math.round((solved / input.eligible) * 100);
}

/**
 * Which page a request actually lands on, and where to start.
 *
 * A page beyond the end canonicalizes to the last one with rows, so a
 * bookmarked page 9 of a since-shrunk roster shows students rather than an
 * empty table nobody can explain.
 */
export function resolveTeacherPage(input: {
  requestedPage: number;
  totalCount: number;
  pageSize: number;
}): { page: number; pageCount: number; skip: number } {
  const pageCount = Math.ceil(Math.max(0, input.totalCount) / input.pageSize);
  const page = Math.min(
    Math.max(1, Math.floor(input.requestedPage)),
    Math.max(1, pageCount),
  );
  return { page, pageCount, skip: (page - 1) * input.pageSize };
}

/**
 * Whole days between two instants, floored.
 *
 * "Seven full days" is the rule, so six days and twenty-three hours is six.
 * The request timestamp is passed in rather than read from the clock: one
 * response must not disagree with itself around a threshold.
 */
export function wholeDaysBetween(
  from: Date | string,
  to: Date | string,
): number {
  const elapsed = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  return Math.floor(elapsed / 86_400_000);
}

/**
 * What one student's work on one exercise currently says about them.
 *
 * Deterministic, unstored, and comparable only with the thresholds above —
 * never with a classmate. Reasons may coexist, and a solved exercise has none
 * at all: the work is done, however it went, and §7.4 refuses to keep
 * flagging a student for the road they took to a correct answer.
 *
 * `latestStatuses` is newest-first and holds only counted attempts, so a judge
 * fault between two failures neither breaks a failure streak nor extends one.
 */
export function attentionReasonsFor(input: {
  status: TeacherProgressStatus;
  /** Latest counted verdicts, newest first. `true` is `PASSED`. */
  latestAccepted: boolean[];
  lastAttemptAt: Date | string | null;
  /** Measured seconds on the latest counted attempt, when it failed. */
  latestFailedSolveSec: number | null;
  now: Date | string;
}): TeacherAttentionReason[] {
  // Solved at the current grading revision. Nothing here applies, and a
  // caller that passes a stale-revision row has already mapped it to
  // `not_started`, which is where it belongs for completion too.
  if (input.status === "solved") return [];

  const reasons: TeacherAttentionReason[] = [];

  const streak = consecutiveFailures(input.latestAccepted);
  if (streak >= REPEATED_FAILURE_ATTEMPTS) {
    reasons.push({ kind: "repeated_failures", value: streak });
  }

  if (input.status === "in_progress" && input.lastAttemptAt) {
    const days = wholeDaysBetween(input.lastAttemptAt, input.now);
    if (days >= STALLED_AFTER_DAYS) {
      reasons.push({ kind: "stalled", value: days });
    }
  }

  const latestFailed = input.latestAccepted[0] === false;
  if (
    latestFailed &&
    input.latestFailedSolveSec !== null &&
    input.latestFailedSolveSec >= LONG_SOLVE_SECONDS
  ) {
    reasons.push({ kind: "long_solve", value: input.latestFailedSolveSec });
  }

  return reasons;
}

/**
 * Failures at the head of the list.
 *
 * Counted from the newest attempt so a student who has since passed, or who
 * is mid-streak after an earlier success, is measured on what they are doing
 * now rather than on their whole history.
 */
function consecutiveFailures(latestAccepted: boolean[]): number {
  let streak = 0;
  for (const accepted of latestAccepted) {
    if (accepted) break;
    streak += 1;
  }
  return streak;
}

/**
 * `1-2-3`, matching the outline number the curriculum itself prints.
 *
 * Nothing rather than `0-0-0` when a position is missing: a coordinate that
 * points nowhere is worse than no coordinate.
 */
export function teacherOutlineNumber(input: {
  modulePosition: number;
  lecturePosition: number;
  problemPosition?: number;
}): string | null {
  const { modulePosition, lecturePosition, problemPosition } = input;
  if (modulePosition <= 0 || lecturePosition <= 0) return null;
  if (problemPosition === undefined) {
    return `${modulePosition}-${lecturePosition}`;
  }
  if (problemPosition <= 0) return null;
  return `${modulePosition}-${lecturePosition}-${problemPosition}`;
}
