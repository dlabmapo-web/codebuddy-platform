import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  courseSummarySchema,
  courseTreeSchema,
} from "../../content/course.js";
import {
  adoptLibraryCourseSchema,
  availableLibraryCourseSchema,
} from "../../platform/library.js";

/**
 * The library, as an academy reads it.
 *
 * Separate from `academyCourses` because it is the only part of the branch
 * surface that reads across an academy boundary, and that boundary belongs in
 * the contract list rather than buried inside a method on a contract whose
 * every other call is scoped to one academy.
 *
 * Which library an academy sees is not a parameter: it is decided by the
 * academy's own `organizationId`, so a customer outside the franchise sees an
 * empty list rather than somebody else's curriculum.
 */
export const academyLibraryContract = {
  /** Published, unretired library courses this academy may adopt. */
  available: oc
    .input(z.object({ academyId: z.uuid() }))
    .output(z.object({ courses: z.array(availableLibraryCourseSchema) })),
  /**
   * The master's outline, read-only, for the preview before adopting.
   *
   * The same `courseTreeSchema` the builder renders, so the preview shows
   * exactly what will arrive rather than a summary of it.
   */
  preview: oc
    .input(z.object({ academyId: z.uuid(), libraryCourseId: z.uuid() }))
    .output(courseTreeSchema),
  /** The one write: a complete copy of the master into this academy. */
  adopt: oc.input(adoptLibraryCourseSchema).output(courseSummarySchema),
};
