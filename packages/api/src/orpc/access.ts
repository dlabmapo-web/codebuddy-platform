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

  /**
   * Authenticated, and — for students only — inside the inactivity window.
   *
   * The learning surfaces are read by two kinds of person. A student is doing
   * the coursework, and §5.2's thirty-minute inactivity policy applies to
   * them. A manager or team lead is previewing curriculum they own, and it
   * does not: staff session policy is deliberately separate.
   *
   * The lease could not tell them apart on its own. It is keyed on the
   * Supabase session, and an absent key is indistinguishable from an expired
   * one — `readDeadline` deletes the key as it expires — so "no lease" cannot
   * mean "not subject to the policy". The role has to be asked for.
   *
   * Until this, it was not asked. `beginStudentSession` runs for everyone who
   * signs in, so a manager was handed a student's lease with nothing to renew
   * it — the client-side guard that extends it is mounted for students — and
   * thirty minutes later every learning read failed with an expiry they could
   * not clear by signing in again, because their actual session was fine.
   */
  const studentAuthenticated = os.middleware(async ({ context, next }) => {
    const token = bearerToken(context.req);
    if (!token) {
      throw new AppException(
        "AUTHENTICATION_REQUIRED",
        HttpStatus.UNAUTHORIZED,
      );
    }
    const identity = await deps.supabaseAuthService.verifyAccessToken(token);
    if (await deps.academyAccessService.isStudentAnywhere(identity.authUserId)) {
      await deps.studentSessionService.requireActive(identity);
    }
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
