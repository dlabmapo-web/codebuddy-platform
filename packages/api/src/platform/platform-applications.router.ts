import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/** The cross-academy applications queue, guarded inside its service. */
export function createPlatformApplicationsRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformApplications: {
      list: os.platformApplications.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformApplicationsService.list(context.identity, input),
        ),
      pendingCount: os.platformApplications.pendingCount
        .use(access.authenticated)
        .handler(({ context }) =>
          deps.platformApplicationsService.pendingCount(context.identity),
        ),
    },
  };
}
