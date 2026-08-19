import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createLearnRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    /**
     * The student's own overview. Authorized by the same student middleware as
     * every other read here; the subject is resolved from the identity, and no
     * input names a student.
     */
    getOverview: os.learn.getOverview
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.studentOverviewService.get(context.identity, input)
      ),
    listCourses: os.learn.listCourses
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.listCourses(context.identity, input.academyId)
      ),
    getCourseOutline: os.learn.getCourseOutline
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.getCourseOutline(context.identity, input)
      ),
    listClasses: os.learn.listClasses
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnClassService.listClasses(context.identity, input.academyId)
      ),
    getClass: os.learn.getClass
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnClassService.getClass(context.identity, input)
      ),
    getExerciseWorkspace: os.learn.getExerciseWorkspace
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.getExerciseWorkspace(context.identity, input)
      ),
    getExerciseBootstrap: os.learn.getExerciseBootstrap
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.getExerciseBootstrap(context.identity, input)
      ),
    listDrafts: os.learn.listDrafts
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.listDrafts(context.identity, input.academyId)
      ),
    saveDraft: os.learn.saveDraft
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.saveDraft(context.identity, input)
      ),
    discardDraft: os.learn.discardDraft
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.discardDraft(context.identity, input)
      ),
    submit: os.learn.submit
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.submissionService.submit(context.identity, input)
      ),
    getSubmission: os.learn.getSubmission
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.submissionService.get(context.identity, input)
      ),
    startSolveSession: os.learn.startSolveSession
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.learnService.startSolveSession(context.identity, input)
      ),
    listAnswerRecords: os.learn.listAnswerRecords
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.answerRecordsService.listAnswerRecords(context.identity, input)
      ),
    listSubmissions: os.learn.listSubmissions
      .use(access.studentAuthenticated)
      .handler(({ context, input }) =>
        deps.submissionService.list(context.identity, input)
      ),
  };
}
