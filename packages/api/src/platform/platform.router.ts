import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The platform operator's surface, as a thin composition.
 *
 * No authorization branch lives here. Every handler's first act inside its
 * service is `PlatformAccessService.requirePermission`, so a route that forgot
 * to guard itself is impossible to write by adding a line to this file.
 */
export function createPlatformRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    platformAcademies: {
      list: os.platformAcademies.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAcademyService.list(context.identity, input),
        ),
      get: os.platformAcademies.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAcademyService.get(context.identity, input.academyId),
        ),
      create: os.platformAcademies.create
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAcademyService.create(context.identity, input),
        ),
      update: os.platformAcademies.update
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformAcademyService.update(context.identity, input),
        ),
      resolveSlug: os.platformAcademies.resolveSlug
        .use(access.authenticated)
        .handler(({ input }) =>
          deps.platformAcademyService.resolveSlug(input.slug),
        ),
      setStatus: os.platformAcademies.setStatus
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformLifecycleService.setStatus(context.identity, input),
        ),
      resendFirstManagerInvitation:
        os.platformAcademies.resendFirstManagerInvitation
          .use(access.authenticated)
          .handler(({ context, input }) =>
            deps.platformAcademyService.resendFirstManagerInvitation(
              context.identity,
              input,
            ),
          ),
    },
  };
}
