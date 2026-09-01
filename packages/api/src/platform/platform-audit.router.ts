import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/** The audit surface, guarded inside its service like every other. */
export function createPlatformAuditRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformAudit: {
      list: os.platformAudit.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAuditService.list(context.identity, input),
        ),
      get: os.platformAudit.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAuditService.get(context.identity, input.entryId),
        ),
    },
  };
}
