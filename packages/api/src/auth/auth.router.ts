import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";
import { createAccess } from "../orpc/access.js";
import { requestAddress } from "../orpc/context.js";

export function createAuthRouter(os: ORPCImplementer, deps: ORPCDeps) {
  const access = createAccess(os, deps);

  return {
    bootstrap: os.auth.bootstrap
      .use(access.authenticated)
      .handler(({ context }) => {
        deps.rateLimitService.assert(
          `auth:bootstrap:${context.identity.authUserId}`,
          30,
          60_000,
        );
        return deps.authService.bootstrap(context.identity);
      }),
    createOAuthOnboardingIntent: os.auth.createOAuthOnboardingIntent
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `oauth:intent:create:${requestAddress(context.req)}`,
          20,
          60 * 60_000,
        );
        return deps.oauthOnboardingIntentService.create(input);
      }),
    completeOAuthOnboarding: os.auth.completeOAuthOnboarding
      .use(access.authenticated)
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `oauth:intent:complete:${context.identity.authUserId}`,
          20,
          60 * 60_000,
        );
        return deps.authService.completeOAuthOnboarding(
          context.identity,
          input.intentToken,
        );
      }),
    me: os.auth.me
      .use(access.authenticated)
      .handler(({ context }) => {
        deps.rateLimitService.assert(
          `auth:me:${context.identity.authUserId}:${requestAddress(context.req)}`,
          60,
          60_000,
        );
        return deps.authService.me(context.identity);
      }),
  };
}
