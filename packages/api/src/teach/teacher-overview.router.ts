import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The academy overview, as one endpoint.
 *
 * A thin composition boundary and nothing more: identity comes from the oRPC
 * context, the contract validates the input, the service is called once, and
 * the strict result is returned. No authorization branch, Prisma query, or
 * metric arithmetic lives here — each has a home where it can be tested
 * without a request.
 */
export function createAcademyTeacherOverviewRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    get: os.academyTeacherOverview.get
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.teacherOverviewService.get(context.identity, input)
      ),
  };
}
