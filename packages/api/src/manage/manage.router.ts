import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The manager's operations surfaces, as three thin compositions.
 *
 * Identity comes from the oRPC context, the contract validates the input, one
 * service is called, and the strict result is returned. No authorization
 * branch, Prisma query, or arithmetic lives here — each has a home where it can
 * be tested without a request, and a router that decided anything would be a
 * fourth place to check when a manager sees a number they do not believe.
 */
export function createManageRouters(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    academyOperationsOverview: {
      get: os.academyOperationsOverview.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.managerOverviewService.get(context.identity, input),
        ),
    },
    academyOperationsProfile: {
      update: os.academyOperationsProfile.update
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.academyOperationsProfileService.update(context.identity, input),
        ),
    },
    academyPeople: {
      list: os.academyPeople.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleDirectoryService.list(context.identity, input),
        ),
    },
    academyPeopleImport: {
      get: os.academyPeopleImport.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleImportService.getPreview(context.identity, input),
        ),
      commit: os.academyPeopleImport.commit
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleImportService.commit(context.identity, input),
        ),
      result: os.academyPeopleImport.result
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleImportService.result(context.identity, input),
        ),
    },
    academyPeopleBulk: {
      preview: os.academyPeopleBulk.preview
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleBulkService.preview(context.identity, input),
        ),
      run: os.academyPeopleBulk.run
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.peopleBulkService.run(context.identity, input),
        ),
    },
    academyInvitationDelivery: {
      list: os.academyInvitationDelivery.list
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.invitationDeliveryService.list(context.identity, input.academyId),
        ),
      resend: os.academyInvitationDelivery.resend
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.invitationDeliveryService.resend(context.identity, input),
        ),
    },
  };
}
