import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * Points and the class ranking.
 *
 * Every board here is a read. A point is written only by the transaction that
 * recorded the fact it describes, so no request may award one — §5.2 of the
 * student points design, and the reason there is no mutation on a student.
 *
 * `policy` is the one namespace that writes, and it writes an academy: what an
 * action pays, for everybody, before anyone has done anything. It cannot name
 * a student and it cannot reach an award already paid.
 */
export function createPointsRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    getPage: os.points.getPage
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.pointsService.getPage(context.identity, input)
      ),
    listLedger: os.points.listLedger
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.pointsService.listLedger(context.identity, input)
      ),
    getClassBoard: os.points.getClassBoard
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.pointsService.getClassBoard(context.identity, input)
      ),
    getOverviewBoard: os.points.getOverviewBoard
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.pointsService.getOverviewBoard(context.identity, input)
      ),
    policy: {
      get: os.points.policy.get
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.pointPolicyService.get(context.identity, input)
        ),
      update: os.points.policy.update
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.pointPolicyService.update(context.identity, input)
        ),
      reset: os.points.policy.reset
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.pointPolicyService.reset(context.identity, input)
        ),
    },
  };
}
