import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  submissionAcceptedSchema,
  submissionInputSchema,
  submissionResultSchema,
  submissionSummarySchema,
  submitExerciseSchema,
} from "../../content/submission.js";
import {
  answerRecordsResultSchema,
  listAnswerRecordsInputSchema,
  solveSessionSchema,
} from "../../content/answer-records.js";
import {
  getStudentOverviewInputSchema,
  studentAcademyOverviewSchema,
} from "../../content/student-overview.js";
import {
  learnAcademyInputSchema,
  learnClassDetailSchema,
  learnClassInputSchema,
  learnClassSummarySchema,
  learnCourseInputSchema,
  learnCourseOutlineSchema,
  learnCourseSummarySchema,
  learnDraftSummarySchema,
  learnExerciseBootstrapInputSchema,
  learnExerciseBootstrapSchema,
  learnExerciseWorkspaceSchema,
  learnMaterialInputSchema,
  saveDraftSchema,
} from "../../content/learn.js";

/**
 * The student-facing surface.
 *
 * Kept separate from `academyCoursesContract` rather than sharing its schemas:
 * that one is the authoring contract and returns HIDDEN test cases to holders
 * of `curriculum.manage`. Nothing here can carry them. Keeping the two
 * namespaces apart is what makes that a structural guarantee instead of a
 * remembered filter.
 */
export const learnContract = {
  /**
   * The student's own academy overview, as one bounded read.
   *
   * §10.1 — one procedure and one instant. Eight independently clocked reads
   * would let the ledger, the chart beneath it, and the class standing below
   * that describe three different moments while sitting on one screen.
   *
   * The input names an academy, a period, and which class a standing should
   * describe. It cannot name a student: the subject is resolved from the
   * caller's identity, and a membership parameter here would be an
   * authorization hole shaped exactly like a teacher's endpoint.
   */
  getOverview: oc
    .input(getStudentOverviewInputSchema)
    .output(studentAcademyOverviewSchema),
  listCourses: oc
    .input(learnAcademyInputSchema)
    .output(z.object({ courses: z.array(learnCourseSummarySchema) })),
  getCourseOutline: oc
    .input(learnCourseInputSchema)
    .output(learnCourseOutlineSchema),
  /**
   * The classes a student learns through, and one of them in full.
   *
   * Read-only by construction. The management mutations stay in
   * `academyClassesContract` and are deliberately not re-exported here: a
   * student namespace that cannot name a mutation cannot grow one by accident.
   */
  listClasses: oc
    .input(learnAcademyInputSchema)
    .output(z.object({ classes: z.array(learnClassSummarySchema) })),
  getClass: oc.input(learnClassInputSchema).output(learnClassDetailSchema),
  getExerciseWorkspace: oc
    .input(learnMaterialInputSchema)
    .output(learnExerciseWorkspaceSchema),
  /**
   * The fullscreen entry point: the exercise and the course it sits in.
   *
   * Kept beside `getExerciseWorkspace` rather than replacing it. Opening the
   * workspace needs the course outline once; stepping to the next exercise
   * inside that same course needs only the lean payload, and paying for the
   * whole curriculum on every step is what this split exists to avoid.
   */
  getExerciseBootstrap: oc
    .input(learnExerciseBootstrapInputSchema)
    .output(learnExerciseBootstrapSchema),
  /**
   * Opens a sitting with one problem, and returns when it started.
   *
   * A procedure rather than a side effect of the bootstrap: reopening the same
   * problem starts a new session, while stepping between exercises inside the
   * workspace has to start one per destination. Making that explicit is what
   * keeps "how long did this take" from quietly measuring a browser tab's age.
   */
  startSolveSession: oc
    .input(learnMaterialInputSchema)
    .output(solveSessionSchema),
  /**
   * Every attempt this student has made in this academy, newest first.
   *
   * Server-paged by construction: the input carries the filters and the page,
   * and the output carries the totals, so no caller can accumulate a whole
   * history in the browser and no caller-supplied user id is ever consulted.
   */
  listAnswerRecords: oc
    .input(listAnswerRecordsInputSchema)
    .output(answerRecordsResultSchema),
  listDrafts: oc
    .input(learnAcademyInputSchema)
    .output(z.object({ drafts: z.array(learnDraftSummarySchema) })),
  saveDraft: oc
    .input(saveDraftSchema)
    .output(z.object({ updatedAt: z.iso.datetime() })),
  discardDraft: oc
    .input(learnMaterialInputSchema)
    .output(z.object({ discarded: z.boolean() })),
  submit: oc.input(submitExerciseSchema).output(submissionAcceptedSchema),
  getSubmission: oc.input(submissionInputSchema).output(submissionResultSchema),
  listSubmissions: oc
    .input(learnMaterialInputSchema)
    .output(z.object({ submissions: z.array(submissionSummarySchema) })),
};
