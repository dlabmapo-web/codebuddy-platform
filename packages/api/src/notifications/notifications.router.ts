import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createNotificationsRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    list: os.notifications.list
      .use(access.authenticated)
      .handler(({ context }) =>
        deps.notificationsService.list(context.identity)
      ),
    acknowledge: os.notifications.acknowledge
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.notificationsService.acknowledge(context.identity, input.id)
      ),
  };
}
