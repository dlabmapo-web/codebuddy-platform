import { createAccess } from "../orpc/access.js";
import {
  requestId,
  type ORPCDeps,
  type ORPCImplementer,
} from "../orpc/context.js";

export function createContentRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    academyCourses: {
      list: os.academyCourses.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.list(context.identity, input.academyId)
        ),
      create: os.academyCourses.create
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.create(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      update: os.academyCourses.update
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.update(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      setVisibility: os.academyCourses.setVisibility
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.setVisibility(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      getTree: os.academyCourses.getTree
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.getTree(context.identity, input)
        ),
      createModule: os.academyCourses.createModule
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.createModule(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      updateModule: os.academyCourses.updateModule
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.updateModule(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      delete: os.academyCourses.delete
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.deleteCourse(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      deleteModule: os.academyCourses.deleteModule
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.deleteModule(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      reorderModules: os.academyCourses.reorderModules
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.reorderModules(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      createLecture: os.academyCourses.createLecture
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.createLecture(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      updateLecture: os.academyCourses.updateLecture
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.updateLecture(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      deleteLecture: os.academyCourses.deleteLecture
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.deleteLecture(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      reorderLectures: os.academyCourses.reorderLectures
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.reorderLectures(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      getExercise: os.academyCourses.getExercise
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.getExercise(context.identity, input)
        ),
      getExerciseSolution: os.academyCourses.getExerciseSolution
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.getExerciseSolution(context.identity, input)
        ),
      createExercise: os.academyCourses.createExercise
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.createExercise(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      updateExercise: os.academyCourses.updateExercise
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.updateExercise(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      deleteExercise: os.academyCourses.deleteExercise
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.deleteExercise(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      reorderExercises: os.academyCourses.reorderExercises
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.reorderExercises(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      setExerciseVisibility: os.academyCourses.setExerciseVisibility
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.setExerciseVisibility(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
    },

    /**
     * §8 — everything after the workbook's bytes have landed.
     *
     * `access.authenticated` only proves who is calling; the `content.import`
     * permission, the academy, the course, and the session's ownership are all
     * checked inside the service, on every one of these three calls. A
     * middleware that checked them once here would be a middleware somebody
     * could add a fourth procedure beside.
     */
    academyContentImports: {
      getPreview: os.academyContentImports.getPreview
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.contentImportService.getPreview(context.identity, input)
        ),
      commit: os.academyContentImports.commit
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.contentImportService.commit(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      getResult: os.academyContentImports.getResult
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.contentImportService.getResult(context.identity, input)
        ),
    },
  };
}
