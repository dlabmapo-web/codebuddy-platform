import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";
import { createAccess } from "../orpc/access.js";

export function createAuthRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    bootstrap: os.auth.bootstrap
      .use(access.authenticated)
      .handler(({ context }) => deps.authService.bootstrap(context.identity)),
    me: os.auth.me
      .use(access.authenticated)
      .handler(({ context }) => deps.authService.me(context.identity)),
  };
}
