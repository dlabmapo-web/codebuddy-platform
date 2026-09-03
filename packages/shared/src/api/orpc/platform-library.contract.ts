import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  createLibraryCourseSchema,
  libraryCopySchema,
  libraryCourseSchema,
  listLibraryCoursesSchema,
  retireLibraryCourseSchema,
} from "../../platform/library.js";

/**
 * The content library, as head office manages it.
 *
 * Deliberately small. Editing a library course's *contents* — its modules,
 * lectures, problems, test cases, and its Excel import — goes through
 * `academyCourses.*` and `academyContentImports.*` unchanged, because a
 * library course is an ordinary `Course` in an academy whose `kind` is
 * `LIBRARY`, and the console mounts the very same editors over it. Restating
 * one curriculum mutation here would be the second implementation the console
 * has so far avoided having.
 *
 * `create` is the one exception, and only because it is the sole call that
 * cannot name an academy: it resolves the organization's library — creating it
 * on first use, as `resolvePlatformOrganization` already does for the
 * organization itself — and then creates the course inside it. Every later
 * call has a `courseId` and needs no such resolution.
 *
 * Publishing and unpublishing are `academyCourses.setVisibility` for the same
 * reason. `retire` is here because retirement means nothing outside a library
 * and has no academy sibling to reuse.
 */
export const platformLibraryContract = {
  /**
   * The library's academy id, or null while nothing has ever been published.
   *
   * The editors mounted over a library course are the academy editors, and
   * those are addressed by academy. The library's own routes carry no academy
   * slug — head office is not standing in one — so the id is resolved here
   * instead of being read out of the URL.
   */
  academy: oc
    .input(z.object({}))
    .output(z.object({ academyId: z.uuid().nullable() })),
  courses: oc
    .input(listLibraryCoursesSchema)
    .output(
      z.object({
        courses: z.array(libraryCourseSchema),
        total: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        pageSize: z.number().int().positive(),
      }),
    ),
  create: oc.input(createLibraryCourseSchema).output(libraryCourseSchema),
  retire: oc.input(retireLibraryCourseSchema).output(libraryCourseSchema),
  /**
   * Which academies hold a copy of one master, at which revision, and whether
   * they have edited it since.
   *
   * Counts and revisions only. It never reads a branch's content: knowing
   * *that* a branch changed its copy is what finds a bad master, and knowing
   * *how* they changed it is not head office's to read from here.
   */
  copies: oc
    .input(z.object({ courseId: z.uuid() }))
    .output(
      z.object({
        copies: z.array(libraryCopySchema),
        total: z.number().int().nonnegative(),
      }),
    ),
};
