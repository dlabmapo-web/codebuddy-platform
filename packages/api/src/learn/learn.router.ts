import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createLearnRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    listCourses: os.learn.listCourses
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.listCourses(context.identity, input.academyId)
      ),
    getCourseOutline: os.learn.getCourseOutline
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.getCourseOutline(context.identity, input)
      ),
    getExerciseWorkspace: os.learn.getExerciseWorkspace
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.getExerciseWorkspace(context.identity, input)
      ),
    listDrafts: os.learn.listDrafts
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.listDrafts(context.identity, input.academyId)
      ),
    saveDraft: os.learn.saveDraft
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.saveDraft(context.identity, input)
      ),
    discardDraft: os.learn.discardDraft
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.learnService.discardDraft(context.identity, input)
      ),
    submit: os.learn.submit
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.submissionService.submit(context.identity, input)
      ),
    getSubmission: os.learn.getSubmission
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.submissionService.get(context.identity, input)
      ),
    listSubmissions: os.learn.listSubmissions
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.submissionService.list(context.identity, input)
      ),
  };
}
