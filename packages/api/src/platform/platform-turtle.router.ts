import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createPlatformTurtleRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);
  return {
    platformTurtle: {
      usage: os.platformTurtle.usage
        .use(access.authenticated)
        .handler(({ context, input }) => deps.platformTurtleService.usage(context.identity, input)),
    },
  };
}
