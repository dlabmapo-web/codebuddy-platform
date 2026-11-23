import { createAccess } from "../orpc/access.js";
import { requestId, type ORPCDeps, type ORPCImplementer } from "../orpc/context.js";

export function createExamRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);
  const student = deps.examService;
  const staff = deps.examStaffService;
  return {
    serverTime: os.exam.serverTime.use(access.authenticated).handler(() => student.serverTime()),
    studentTest: os.exam.studentTest.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.studentTest(context.identity, input)),
    start: os.exam.start.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.start(context.identity, input, { requestId: requestId(context.req) })),
    attempt: os.exam.attempt.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.attempt(context.identity, input)),
    item: os.exam.item.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.item(context.identity, input)),
    submit: os.exam.submit.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.submit(context.identity, input)),
    recordRun: os.exam.recordRun.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.recordRun(context.identity, input)),
    end: os.exam.end.use(access.studentAuthenticated)
      .handler(({ context, input }) => student.end(context.identity, input, { requestId: requestId(context.req) })),

    staffTest: os.exam.staffTest.use(access.authenticated)
      .handler(({ context, input }) => staff.staffTest(context.identity, input)),
    createTest: os.exam.createTest.use(access.authenticated)
      .handler(({ context, input }) => staff.createTest(context.identity, input, { requestId: requestId(context.req) })),
    convertLecture: os.exam.convertLecture.use(access.authenticated)
      .handler(({ context, input }) => staff.convertLecture(context.identity, input, { requestId: requestId(context.req) })),
    updateTest: os.exam.updateTest.use(access.authenticated)
      .handler(({ context, input }) => staff.updateTest(context.identity, input, { requestId: requestId(context.req) })),
    exportCourseReport: os.exam.exportCourseReport.use(access.authenticated)
      .handler(({ context, input }) => staff.exportCourseReport(context.identity, input)),

    classTests: os.exam.classTests.use(access.authenticated)
      .handler(({ context, input }) => staff.classTests(context.identity, input)),
    results: os.exam.results.use(access.authenticated)
      .handler(({ context, input }) => staff.results(context.identity, input)),
    exportResults: os.exam.exportResults.use(access.authenticated)
      .handler(({ context, input }) => staff.exportResults(context.identity, input)),
    updateSchedule: os.exam.updateSchedule.use(access.authenticated)
      .handler(({ context, input }) => staff.updateSchedule(context.identity, input, { requestId: requestId(context.req) })),
    endAttempt: os.exam.endAttempt.use(access.authenticated)
      .handler(({ context, input }) => staff.endAttempt(context.identity, input, { requestId: requestId(context.req) })),
    grantRetake: os.exam.grantRetake.use(access.authenticated)
      .handler(({ context, input }) => staff.grantRetake(context.identity, input, { requestId: requestId(context.req) })),
  };
}
