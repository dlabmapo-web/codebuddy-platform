import { createAccess } from "../../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../../orpc/context.js";

/** The library as an academy uses it: two reads and one copy. */
export function createAcademyLibraryRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    academyLibrary: {
      available: os.academyLibrary.available
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyLibraryService.available(context.identity, input),
        ),
      preview: os.academyLibrary.preview
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyLibraryService.preview(context.identity, input),
        ),
      adopt: os.academyLibrary.adopt
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyLibraryService.adopt(context.identity, input),
        ),
    },
  };
}
