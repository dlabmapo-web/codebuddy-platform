import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The library's own three operations.
 *
 * Everything about a library course's *contents* is absent on purpose: the
 * console mounts the academy editors over a library course and calls
 * `academyCourses.*` and `academyContentImports.*`, which authorize through
 * the library branch of `AcademyAccessService`. One implementation of every
 * curriculum mutation, as everywhere else in the console.
 */
export function createPlatformLibraryRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformLibrary: {
      academy: os.platformLibrary.academy
        .use(access.authenticated)
        .handler(({ context }) =>
          deps.platformLibraryService.academy(context.identity),
        ),
      courses: os.platformLibrary.courses
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformLibraryService.courses(context.identity, input),
        ),
      create: os.platformLibrary.create
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformLibraryService.create(context.identity, input),
        ),
      retire: os.platformLibrary.retire
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformLibraryService.retire(context.identity, input),
        ),
      copies: os.platformLibrary.copies
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformLibraryService.copies(context.identity, input),
        ),
    },
  };
}
