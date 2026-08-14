import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createStudentSessionRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);
  return {
    begin: os.studentSession.begin
      .use(access.trustedBff)
      .use(access.authenticated)
      .handler(({ context }) =>
        deps.studentSessionService.begin(context.identity)
      ),
    current: os.studentSession.current
      .use(access.authenticated)
      .handler(({ context }) =>
        deps.studentSessionService.current(context.identity)
      ),
    extend: os.studentSession.extend
      .use(access.authenticated)
      .handler(({ context }) =>
        deps.studentSessionService.extend(context.identity)
      ),
  };
}
