import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * Support access, as a thin composition.
 *
 * No authorization branch here: every handler's first act inside the service
 * is `PlatformAccessService.requirePermission`. `active` is the deliberate
 * exception and says so in the service — it answers only about the caller and
 * returns `null` to everyone without a grant, which is what lets the studio
 * shell ask it on every academy page.
 */
export function createPlatformSupportRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformSupport: {
      list: os.platformSupport.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSupportService.list(context.identity, input),
        ),
      get: os.platformSupport.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSupportService.get(context.identity, input.grantId),
        ),
      open: os.platformSupport.open
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSupportService.open(context.identity, input),
        ),
      revoke: os.platformSupport.revoke
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSupportService.revoke(context.identity, input.grantId),
        ),
      active: os.platformSupport.active
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSupportService.active(context.identity, input.academySlug),
        ),
    },
  };
}
