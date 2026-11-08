import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";
export function createStudentWorkHistoryRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);
  return {
    listClasses: os.studentWorkHistory.listClasses
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.listClasses(context.identity, input),
      ),
    listStudentRoster: os.studentWorkHistory.listStudentRoster
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.listStudentRoster(
          context.identity,
          input,
        ),
      ),
    getStudentSummary: os.studentWorkHistory.getStudentSummary
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.getStudentSummary(
          context.identity,
          input,
        ),
      ),
    listStudentMaterials: os.studentWorkHistory.listStudentMaterials
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.listStudentMaterials(
          context.identity,
          input,
        ),
      ),
    listMaterialStudents: os.studentWorkHistory.listMaterialStudents
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.listMaterialStudents(
          context.identity,
          input,
        ),
      ),
    listAttempts: os.studentWorkHistory.listAttempts
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.listAttempts(context.identity, input),
      ),
    getSubmission: os.studentWorkHistory.getSubmission
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.studentWorkHistoryService.getSubmission(context.identity, input),
      ),
  };
}
