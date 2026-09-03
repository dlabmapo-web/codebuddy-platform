import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * The console's class ranking.
 *
 * One read. No authorization branch lives here — the first act inside the
 * service is `PlatformAccessService.requirePermission`, so a route that forgot
 * to guard itself is impossible to write by adding a line to this file.
 */
export function createPlatformRankingRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformRanking: {
      classes: os.platformRanking.classes
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformRankingService.classes(context.identity, input),
        ),
    },
  };
}
