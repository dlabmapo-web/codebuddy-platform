import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * Solution status, as endpoints.
 *
 * A thin composition boundary and nothing more: identity comes from the oRPC
 * context, the contract validates the input, the service is called once, and
 * the strict result is returned. There is no authorization branch, Prisma
 * query, or metric arithmetic here — every one of those has a home where it
 * can be tested without a request.
 *
 * See §13.4 of the teacher solution status design.
 */
export function createTeacherProgressRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    listStudents: os.teacherProgress.listStudents
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listStudents(context.identity, input)
      ),
    getStudentDetail: os.teacherProgress.getStudentDetail
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.getStudentDetail(context.identity, input)
      ),
    listAttempts: os.teacherProgress.listAttempts
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listAttempts(context.identity, input)
      ),
    listCurriculum: os.teacherProgress.listCurriculum
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listCurriculum(context.identity, input)
      ),
    listCourseOutline: os.teacherProgress.listCourseOutline
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listCourseOutline(context.identity, input)
      ),
    listLectureProblems: os.teacherProgress.listLectureProblems
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listLectureProblems(context.identity, input)
      ),
    listProblemStudents: os.teacherProgress.listProblemStudents
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.listProblemStudents(context.identity, input)
      ),
    getSubmissionReview: os.teacherProgress.getSubmissionReview
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherProgressService.getSubmissionReview(context.identity, input)
      ),
  };
}
