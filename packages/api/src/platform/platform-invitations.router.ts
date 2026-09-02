import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/** The cross-academy invitations queue, guarded inside its service. */
export function createPlatformInvitationsRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformInvitations: {
      list: os.platformInvitations.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformInvitationsService.list(context.identity, input),
        ),
    },
  };
}
