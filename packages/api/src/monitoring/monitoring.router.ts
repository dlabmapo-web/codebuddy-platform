import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The durable monitoring reads. Nothing here needs a socket, so a realtime
 * outage degrades the live state and leaves the pages themselves working.
 */
export function createMonitoringRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    listAssignedClasses: os.monitoring.listAssignedClasses
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.listAssignedClasses(context.identity, input)
      ),
    getClassRoster: os.monitoring.getClassRoster
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.getClassRoster(context.identity, input)
      ),
    getStudentContext: os.monitoring.getStudentContext
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.getStudentContext(context.identity, input)
      ),
    listFeedback: os.monitoring.listFeedback
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.listFeedback(context.identity, input)
      ),
  };
}
