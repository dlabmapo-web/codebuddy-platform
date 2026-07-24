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
      archive: os.academyCourses.archive
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.archive(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      createDraft: os.academyCourses.createDraft
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.createDraft(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      getDraftTree: os.academyCourses.getDraftTree
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.getDraftTree(context.identity, input)
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
      validateVersion: os.academyCourses.validateVersion
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.validateVersion(context.identity, input)
        ),
      publishVersion: os.academyCourses.publishVersion
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.courseService.publishVersion(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
    },
  };
}
