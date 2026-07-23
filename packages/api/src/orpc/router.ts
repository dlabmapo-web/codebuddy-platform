import type { NestExpressApplication } from "@nestjs/platform-express";
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import type { NextFunction, Request, Response } from "express";
import { appContract } from "@cove/shared";

import { AcademyDiscoveryService } from "../academies/academy-discovery.service.js";
import { AcademyInvitationService } from "../academies/academy-invitation.service.js";
import { AcademyJoinRequestService } from "../academies/academy-join-request.service.js";
import { AcademyMembershipService } from "../academies/academy-membership.service.js";
import { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import { createAcademiesRouters } from "../academies/academies.router.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { AuthService } from "../auth/auth.service.js";
import { OAuthOnboardingIntentService } from "../auth/oauth-onboarding-intent.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { createAuthRouter } from "../auth/auth.router.js";
import type { ORPCContext, ORPCDeps } from "./context.js";
import { toORPCError } from "./error-mapping.js";

export function registerORPCRoutes(app: NestExpressApplication): void {
  const router = createORPCRouter({
    authService: app.get(AuthService, { strict: false }),
    oauthOnboardingIntentService: app.get(OAuthOnboardingIntentService, {
      strict: false,
    }),
    supabaseAuthService: app.get(SupabaseAuthService, { strict: false }),
    academyDiscoveryService: app.get(AcademyDiscoveryService, { strict: false }),
    academyInvitationService: app.get(AcademyInvitationService, {
      strict: false,
    }),
    academyJoinRequestService: app.get(AcademyJoinRequestService, {
      strict: false,
    }),
    academyMembershipService: app.get(AcademyMembershipService, {
      strict: false,
    }),
    academyOnboardingService: app.get(AcademyOnboardingService, {
      strict: false,
    }),
    rateLimitService: app.get(RateLimitService, { strict: false }),
  });
  const handler = new RPCHandler(router, {
    interceptors: [
      async (options) => {
        try {
          return await options.next();
        } catch (error) {
          throw toORPCError(error);
        }
      },
    ],
  });

  app.use(
    "/api/rpc{/*path}",
    async (req: Request, res: Response, next: NextFunction) => {
      const { matched } = await handler.handle(req, res, {
        prefix: "/api/rpc",
        context: { req },
      });
      if (!matched) next();
    },
  );
}

function createORPCRouter(deps: ORPCDeps) {
  const os = implement<typeof appContract, ORPCContext>(appContract);
  const academyRouters = createAcademiesRouters(os, deps);
  return os.router({
    auth: createAuthRouter(os, deps),
    ...academyRouters,
  });
}
