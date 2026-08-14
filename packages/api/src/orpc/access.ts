import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import {
  bearerToken,
  isTrustedBffRequest,
  type ORPCDeps,
  type ORPCImplementer,
} from "./context.js";

export function createAccess(os: ORPCImplementer, deps: ORPCDeps) {
  const authenticated = os.middleware(async ({ context, next }) => {
    const token = bearerToken(context.req);
    if (!token) {
      throw new AppException(
        "AUTHENTICATION_REQUIRED",
        HttpStatus.UNAUTHORIZED,
      );
    }

    const identity = await deps.supabaseAuthService.verifyAccessToken(token);
    return next({ context: { identity } });
  });

  const studentAuthenticated = os.middleware(async ({ context, next }) => {
    const token = bearerToken(context.req);
    if (!token) {
      throw new AppException(
        "AUTHENTICATION_REQUIRED",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const identity = await deps.supabaseAuthService.verifyAccessToken(token);
    await deps.studentSessionService.requireActive(identity);
    return next({ context: { identity } });
  });

  const trustedBff = os.middleware(async ({ context, next }) => {
    if (!isTrustedBffRequest(context.req)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    return next();
  });

  return { authenticated, studentAuthenticated, trustedBff };
}
