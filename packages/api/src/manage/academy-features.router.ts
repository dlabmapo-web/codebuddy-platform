import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

export function createAcademyFeaturesRouter(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);
  return {
    list: os.academyFeatures.list
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.academyFeaturesService.list(context.identity, input),
      ),
    setEnabled: os.academyFeatures.setEnabled
      .use(access.authenticated)
      .handler(({ context, input }) =>
        deps.academyFeaturesService.setEnabled(context.identity, input),
      ),
  };
}
