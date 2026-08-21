import type { ORPCDeps, ORPCImplementer } from "../orpc/context.js";
import { createAccess } from "../orpc/access.js";
import { requestAddress } from "../orpc/context.js";
import { AppException } from "../common/app-exception.js";
import { PasswordRecoveryService } from "./password-recovery.service.js";

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
    checkUsernameAvailable: os.auth.checkUsernameAvailable
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `auth:username:check:${requestAddress(context.req)}`,
          30,
          10 * 60_000,
        );
        return deps.authService
          .isUsernameAvailable(input.username)
          .then((available) => ({ available }));
      }),
    resolveSignInEmail: os.auth.resolveSignInEmail
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `auth:signin:resolve:${requestAddress(context.req)}`,
          20,
          10 * 60_000,
        );
        return deps.authService.resolveSignInEmail(input.identifier);
      }),
    requestPasswordRecovery: os.auth.requestPasswordRecovery
      .use(access.trustedBff)
      .handler(async ({ context, input }) => {
        const accepted = { accepted: true } as const;

        // Being limited is not a failure the caller may see. A 429 here would
        // answer a question the body refuses to: hitting the per-username
        // ceiling means somebody else is already asking about that username,
        // which is only true for a name worth asking about.
        try {
          deps.rateLimitService.assert(
            `auth:recovery:ip:${requestAddress(context.req)}`,
            5,
            15 * 60_000,
          );
          deps.rateLimitService.assert(
            `auth:recovery:user:${
              PasswordRecoveryService.usernameDigest(input.username)
            }`,
            3,
            60 * 60_000,
          );
        } catch (error) {
          if (error instanceof AppException && error.code === "RATE_LIMITED") {
            return accepted;
          }
          throw error;
        }

        // A provider outage must not become an availability oracle either:
        // the service already swallows delivery failure, and anything it
        // rethrows is answered with the same page as a delivered email.
        try {
          await deps.passwordRecoveryService.request(
            input.username,
            input.captchaToken,
          );
        } catch {
          // Recorded inside the service, without the username.
        }
        return accepted;
      }),
    setUsername: os.auth.setUsername
      .use(access.authenticated)
      .handler(({ context, input }) => {
        deps.rateLimitService.assert(
          `auth:username:set:${context.identity.authUserId}`,
          10,
          60 * 60_000,
        );
        return deps.authService.setUsername(context.identity, input.username);
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
