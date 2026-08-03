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
  learnAcademyInputSchema,
  learnCourseInputSchema,
  learnCourseOutlineSchema,
  learnCourseSummarySchema,
  learnDraftSummarySchema,
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
  listCourses: oc
    .input(learnAcademyInputSchema)
    .output(z.object({ courses: z.array(learnCourseSummarySchema) })),
  getCourseOutline: oc
    .input(learnCourseInputSchema)
    .output(learnCourseOutlineSchema),
  getExerciseWorkspace: oc
    .input(learnMaterialInputSchema)
    .output(learnExerciseWorkspaceSchema),
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
