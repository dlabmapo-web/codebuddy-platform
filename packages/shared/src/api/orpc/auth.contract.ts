import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  authMeResponseSchema,
  socialAuthProviderSchema,
  usernameSchema,
} from "../../auth/index.js";
import { emptyInputSchema } from "./common.contract.js";

export const authContract = {
  bootstrap: oc.input(emptyInputSchema).output(authMeResponseSchema),
  checkUsernameAvailable: oc
    .input(z.object({ username: usernameSchema }))
    .output(z.object({ available: z.boolean() })),
  /**
   * Public by necessity — it runs before a session exists. It answers with a
   * syntactically valid address for a username it has never seen, so a wrong
   * username and a wrong password fail identically downstream and this route
   * cannot be walked to discover who holds an account.
   */
  resolveSignInEmail: oc
    .input(z.object({ identifier: z.string().min(1).max(320) }))
    .output(z.object({ email: z.string() })),
  /**
   * BFF-only. Answers `{ accepted: true }` for every well-formed username so
   * that a known name, an unknown name, an OAuth-only account, and a suspended
   * one are indistinguishable from the browser. Nothing about the account —
   * email, identity list, user id, existence — comes back.
   */
  requestPasswordRecovery: oc
    .input(z.object({
      username: usernameSchema,
      captchaToken: z.string().min(1).max(4096).optional(),
    }))
    .output(z.object({ accepted: z.literal(true) })),
  setUsername: oc
    .input(z.object({ username: usernameSchema }))
    .output(authMeResponseSchema),
  createOAuthOnboardingIntent: oc
    .input(z.object({
      academyId: z.uuid(),
      provider: socialAuthProviderSchema,
    }))
    .output(z.object({
      token: z.string().min(32),
      expiresAt: z.iso.datetime(),
    })),
  completeOAuthOnboarding: oc
    .input(z.object({ intentToken: z.string().min(32).optional() }))
    .output(authMeResponseSchema),
  me: oc.input(emptyInputSchema).output(authMeResponseSchema),
};
