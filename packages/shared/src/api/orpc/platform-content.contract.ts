import { oc } from "@orpc/contract";

import {
  listPlatformClassesResultSchema,
  listPlatformContentInputSchema,
  listPlatformCoursesResultSchema,
  platformContentSummaryInputSchema,
  platformContentSummarySchema,
} from "../../platform/content.js";

/**
 * What every academy teaches, browsable from the console.
 *
 * This contract reads only. The console's native editors and row actions use
 * the existing academy mutation contracts, so one implementation of every
 * curriculum operation exists rather than a platform-specific copy.
 *
 * Nothing here returns a submission, a grade, or a student. A problem's hidden
 * test cases are counted, never listed — and counted only in the aggregate, as
 * "how many problems under this course cannot grade": the number is what tells
 * an operator whether curriculum is finished, and the cases themselves are the
 * academy's.
 */
export const platformContentContract = {
  summary: oc
    .input(platformContentSummaryInputSchema)
    .output(platformContentSummarySchema),
  courses: oc
    .input(listPlatformContentInputSchema)
    .output(listPlatformCoursesResultSchema),
  classes: oc
    .input(listPlatformContentInputSchema)
    .output(listPlatformClassesResultSchema),
};
