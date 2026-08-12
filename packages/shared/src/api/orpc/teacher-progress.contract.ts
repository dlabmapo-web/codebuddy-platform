import { oc } from "@orpc/contract";

import {
  getTeacherStudentDetailInputSchema,
  getTeacherSubmissionReviewInputSchema,
  listTeacherAttemptsInputSchema,
  listTeacherCourseOutlineInputSchema,
  listTeacherCurriculumInputSchema,
  listTeacherLectureProblemsInputSchema,
  listTeacherProblemStudentsInputSchema,
  listTeacherStudentsInputSchema,
  teacherAttemptsResultSchema,
  teacherCourseOutlineResultSchema,
  teacherCurriculumResultSchema,
  teacherLectureProblemsResultSchema,
  teacherProblemStudentsResultSchema,
  teacherStudentProgressDetailSchema,
  teacherStudentsResultSchema,
  teacherSubmissionReviewSchema,
} from "../../content/teacher-progress.js";

/**
 * Solution status: what an assigned teacher may read about their own class.
 *
 * Read-only by construction. The namespace cannot name a mutation, so it
 * cannot grow one by accident — a teacher never edits code, verdicts, scores,
 * or progress, and there is no regrade here to reach for.
 *
 * The operations are task-shaped rather than one endpoint taking a `view`
 * string. Each one names the scope it resolves, which is what keeps its
 * selects, its pagination, and its authorization checkable in isolation.
 *
 * See §12 of the teacher solution status design.
 */
export const teacherProgressContract = {
  /** The roster page: class summary, student rows, facets, pagination. */
  listStudents: oc
    .input(listTeacherStudentsInputSchema)
    .output(teacherStudentsResultSchema),
  /** One student's exercises. Selected by membership, never by user id. */
  getStudentDetail: oc
    .input(getTeacherStudentDetailInputSchema)
    .output(teacherStudentProgressDetailSchema),
  /**
   * One student's attempts at one exercise, newest first.
   *
   * The single attempt-history contract. By student and By problem both read
   * it, so the two views cannot drift into disagreeing about what a student
   * did.
   */
  listAttempts: oc
    .input(listTeacherAttemptsInputSchema)
    .output(teacherAttemptsResultSchema),
  /** The assigned courses, summarized. The By-problem entry point. */
  listCurriculum: oc
    .input(listTeacherCurriculumInputSchema)
    .output(teacherCurriculumResultSchema),
  /** One course's modules and lectures. Loaded on expansion, never eagerly. */
  listCourseOutline: oc
    .input(listTeacherCourseOutlineInputSchema)
    .output(teacherCourseOutlineResultSchema),
  listLectureProblems: oc
    .input(listTeacherLectureProblemsInputSchema)
    .output(teacherLectureProblemsResultSchema),
  listProblemStudents: oc
    .input(listTeacherProblemStudentsInputSchema)
    .output(teacherProblemStudentsResultSchema),
  /**
   * The one operation that selects submitted code.
   *
   * Separated from every list for that reason: no filter, page, or export can
   * turn a table into a bulk source-code read.
   */
  getSubmissionReview: oc
    .input(getTeacherSubmissionReviewInputSchema)
    .output(teacherSubmissionReviewSchema),
};
