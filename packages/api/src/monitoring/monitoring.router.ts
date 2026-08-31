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
    getStudentCurriculum: os.monitoring.getStudentCurriculum
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.getStudentCurriculum(context.identity, input)
      ),
    getExercisePreview: os.monitoring.getExercisePreview
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.getExercisePreview(context.identity, input)
      ),
    // The only monitoring read with a write behind it: every view records an
    // audit row, which is what makes looking at an answer accountable. That is
    // also what makes it worth a ceiling its siblings do not need — a teacher
    // opens the modal a handful of times a lesson, and a loop that opens it a
    // thousand times would bury the record it is supposed to leave.
    getExerciseSolution: os.monitoring.getExerciseSolution
      .use(access.authenticated)
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `monitoring:solution:${context.identity.authUserId}`,
          60,
          60_000,
        );
        return deps.monitoringService.getExerciseSolution(
          context.identity,
          input,
        );
      }),
    listFeedback: os.monitoring.listFeedback
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.listFeedback(context.identity, input)
      ),
    listMyFeedback: os.monitoring.listMyFeedback
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.listMyFeedback(context.identity, input)
      ),
    markMyFeedbackRead: os.monitoring.markMyFeedbackRead
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.monitoringService.markMyFeedbackRead(context.identity, input)
      ),
  };
}
