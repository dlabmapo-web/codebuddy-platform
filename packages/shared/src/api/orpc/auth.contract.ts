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
  /**
   * Creates a student account, which has no email address.
   *
   * Separate from the browser's own `supabase.auth.signUp` for two reasons a
   * form cannot work around. Supabase requires an address, and any address the
   * browser invented would be one the browser could choose; and an account
   * created by `signUp` has an unconfirmed email, which makes
   * `ensureSignupRequest` skip the academy join request and strands the student
   * on `/welcome` with no way forward. The API creates the identity with the
   * service-role client, confirmed, against a generated placeholder.
   *
   * Answers with that placeholder so the browser can sign in with it. It is
   * not a secret — it authenticates nothing without the password — and
   * returning it saves a round trip.
   */
  signUpStudent: oc
    .input(z.object({
      username: usernameSchema,
      displayName: z.string().trim().min(2).max(100),
      password: z.string().min(8).max(72),
      academyId: z.uuid(),
      captchaToken: z.string().min(1).max(4096).optional(),
    }))
    .output(z.object({ email: z.string() })),
  /**
   * Forgets the password a manager issued to this account, because the account
   * holder has just replaced it.
   *
   * The invariant `StudentIssuedCredential` rests on: Cove keeps only a
   * password it generated, and only while that is still the password. The
   * change itself happens in the browser against Supabase — Cove never sees
   * the new value — so this is the call that tells the API the old one is
   * dead. Idempotent, and harmless for an account that never had one.
   */
  forgetIssuedPassword: oc
    .input(emptyInputSchema)
    .output(z.object({ forgotten: z.boolean() })),
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
