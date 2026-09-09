import { createAccess } from "../orpc/access.js";
import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";

/**
 * How every academy is configured.
 *
 * Two reads. No authorization branch lives here — the first act inside the
 * service is `PlatformAccessService.requirePermission`, so a route that forgot
 * to guard itself is impossible to write by adding a line to this file.
 */
export function createPlatformSettingsRouters(
  os: ORPCImplementer,
  deps: ORPCDeps,
) {
  const access = createAccess(os, deps);

  return {
    platformSettings: {
      features: os.platformSettings.features
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSettingsService.features(context.identity, input),
        ),
      pointPolicies: os.platformSettings.pointPolicies
        .use(access.authenticated)
        .handler(({ context, input }) =>
          deps.platformSettingsService.pointPolicies(context.identity, input),
        ),
    },
  };
}
