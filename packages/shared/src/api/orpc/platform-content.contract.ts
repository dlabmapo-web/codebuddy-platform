import { oc } from "@orpc/contract";

import {
  listPlatformClassesResultSchema,
  listPlatformContentInputSchema,
  listPlatformCoursesResultSchema,
  listPlatformProblemsResultSchema,
} from "../../platform/content.js";

/**
 * What every academy teaches, browsable from the console.
 *
 * Reads only — deliberately, and permanently. Editing curriculum belongs to
 * the academy's own screens under a support session, so that one
 * implementation of every content mutation exists rather than two, and so a
 * change Cove makes is indistinguishable in mechanism from one the customer's
 * Team Lead makes, and distinguishable in the audit trail by the grant that
 * authorized it.
 *
 * Nothing here returns a submission, a grade, or a student. A problem's hidden
 * test cases are counted, never listed: the count is what tells an operator
 * whether a problem is finished, and the cases themselves are the academy's.
 */
export const platformContentContract = {
  courses: oc
    .input(listPlatformContentInputSchema)
    .output(listPlatformCoursesResultSchema),
  classes: oc
    .input(listPlatformContentInputSchema)
    .output(listPlatformClassesResultSchema),
  problems: oc
    .input(listPlatformContentInputSchema)
    .output(listPlatformProblemsResultSchema),
};
