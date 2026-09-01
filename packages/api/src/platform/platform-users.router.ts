import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The operator's people surface, as a thin composition.
 *
 * No authorization branch here, for the reason `platform.router.ts` gives:
 * every handler's first act inside its service is
 * `PlatformAccessService.requirePermission`, so a route that forgot to guard
 * itself cannot be written by adding a line to this file.
 */
export function createPlatformUsersRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformUsers: {
      list: os.platformUsers.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformUsersService.list(context.identity, input),
        ),
      get: os.platformUsers.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformUsersService.get(context.identity, input.userId),
        ),
      setStatus: os.platformUsers.setStatus
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformUsersService.setStatus(context.identity, input),
        ),
    },
  };
}
