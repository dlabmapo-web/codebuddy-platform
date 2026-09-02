import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/** Cross-academy content browsing, guarded inside its service like the rest. */
export function createPlatformContentRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformContent: {
      summary: os.platformContent.summary
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformContentService.summary(context.identity, input),
        ),
      courses: os.platformContent.courses
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformContentService.courses(context.identity, input),
        ),
      classes: os.platformContent.classes
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformContentService.classes(context.identity, input),
        ),
    },
  };
}
