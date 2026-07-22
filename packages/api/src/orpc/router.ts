import type { NestExpressApplication } from "@nestjs/platform-express";
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import type { NextFunction, Request, Response } from "express";
import { appContract } from "@cove/shared";

import { AuthService } from "../auth/auth.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { createAuthRouter } from "../auth/auth.router.js";
import type { ORPCContext, ORPCDeps } from "./context.js";
import { toORPCError } from "./error-mapping.js";

export function registerORPCRoutes(app: NestExpressApplication): void {
  const router = createORPCRouter({
    authService: app.get(AuthService, { strict: false }),
    supabaseAuthService: app.get(SupabaseAuthService, { strict: false }),
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
  return os.router({ auth: createAuthRouter(os, deps) });
}
