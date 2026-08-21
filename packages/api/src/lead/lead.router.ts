import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The Team Lead's curriculum overview, as one thin composition.
 *
 * Identity comes from the oRPC context, the contract validates the input, one
 * service is called, and the strict result is returned. No authorization
 * branch, Prisma query, or arithmetic lives here — each has a home where it can
 * be tested without a request, and a router that decided anything would be a
 * fourth place to check when a Team Lead sees a number they do not believe.
 */
export function createAcademyCurriculumOverviewRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    get: os.academyCurriculumOverview.get
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teamLeadOverviewService.get(context.identity, input),
      ),
  };
}
