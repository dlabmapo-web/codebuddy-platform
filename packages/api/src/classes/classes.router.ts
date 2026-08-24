import { createAccess } from "../orpc/access.js";
import {
  requestId,
  type ORPCDeps,
  type ORPCImplementer,
} from "../orpc/context.js";

export function createClassesRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    academyClasses: {
      list: os.academyClasses.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.list(context.identity, input)
        ),
      get: os.academyClasses.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.get(context.identity, input)
        ),
      create: os.academyClasses.create
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.create(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      update: os.academyClasses.update
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.update(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      setStatus: os.academyClasses.setStatus
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.setStatus(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      setCourses: os.academyClasses.setCourses
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.setCourses(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      setSchedule: os.academyClasses.setSchedule
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.setSchedule(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      listEligibleStudents: os.academyClasses.listEligibleStudents
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.listEligibleStudents(context.identity, input)
        ),
      addStudents: os.academyClasses.addStudents
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.addStudents(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      removeStudent: os.academyClasses.removeStudent
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.removeStudent(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
      listEligibleTeachers: os.academyClasses.listEligibleTeachers
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.listEligibleTeachers(context.identity, input)
        ),
      setTeacher: os.academyClasses.setTeacher
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.classesService.setTeacher(context.identity, input, {
            requestId: requestId(context.req),
          })
        ),
    },
  };
}
