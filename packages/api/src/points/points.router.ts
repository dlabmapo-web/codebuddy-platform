import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * Points and the class ranking.
 *
 * Both operations are reads, and the namespace has no third. A point is
 * written only by the transaction that recorded the fact it describes, so
 * there is nothing here for a request to call. §5.2 of the student points
 * design.
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
  };
}
