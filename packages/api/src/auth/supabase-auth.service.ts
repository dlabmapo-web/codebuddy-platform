import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPlaceholderAddress, parseUsername } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import type { SupabaseIdentity } from "./auth.types.js";

export type PasswordIdentityStatus = "present" | "absent" | "unavailable";

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.client = createClient(
      config.get("SUPABASE_URL", { infer: true }),
      config.get("SUPABASE_SECRET_KEY", { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  async verifyAccessToken(token: string): Promise<SupabaseIdentity> {
    const { data, error } = await this.client.auth.getClaims(token);
    const claims = data?.claims;

    if (error || !claims || typeof claims.sub !== "string") {
      throw new AppException("TOKEN_INVALID", HttpStatus.UNAUTHORIZED);
    }

    const metadata = isRecord(claims.user_metadata)
      ? claims.user_metadata
      : {};
    const appMetadata = isRecord(claims.app_metadata)
      ? claims.app_metadata
      : {};
    const email = typeof claims.email === "string"
      ? claims.email.trim().toLowerCase()
      : null;
    const emailVerified = claims.email_verified === true ||
      metadata.email_verified === true ||
      metadata.email_confirmed === true;

    return {
      authUserId: claims.sub,
      sessionId: firstUuid(claims.session_id),
      email,
      // Decided here, from the address itself, so no caller has to know what a
      // generated address looks like in order to avoid displaying one.
      emailIsPlaceholder: isPlaceholderAddress(email),
      emailVerified: email !== null && emailVerified,
      // User metadata is client-writable, so this is untrusted input and is
      // revalidated here rather than trusted as a stored value.
      username: parseUsername(metadata.username),
      displayName: firstString(metadata.full_name, metadata.name),
      avatarUrl: firstUrl(metadata.avatar_url, metadata.picture),
      provider: firstString(appMetadata.provider),
      requestedAcademyId: firstUuid(metadata.requested_academy_id),
    };
  }

  /**
   * Creates a confirmed password identity for an account with no email.
   *
   * `email_confirm: true` is not a trick. There is nothing to confirm — the
   * address is generated and resolves nowhere — and an unconfirmed identity
   * would make `emailVerified` false in every token, which makes
   * `ensureSignupRequest` skip the academy join request and strands the
   * student on `/welcome` with no way forward.
   *
   * Metadata carries the same three keys the browser signup writes, so
   * `bootstrap` claims the username and creates the join request through
   * exactly the path it already uses.
   */
  async createStudentUser(input: {
    email: string;
    password: string;
    username: string;
    displayName: string;
    requestedAcademyId: string;
  }): Promise<{ authUserId: string }> {
    const { data, error } = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        username: input.username,
        full_name: input.displayName,
        requested_academy_id: input.requestedAcademyId,
      },
    });
    if (error || !data?.user) {
      throw new AppException("SIGNUP_STUDENT_FAILED", HttpStatus.BAD_GATEWAY);
    }
    return { authUserId: data.user.id };
  }

  /**
   * Removes an auth identity.
   *
   * Only ever called to undo a `createStudentUser` whose Cove-side transaction
   * failed. A Supabase identity with no Cove row is the orphan state that
   * leaves somebody authenticated with nowhere to land and unable to sign up
   * again, and this is the one moment it can still be avoided.
   */
  async deleteUser(authUserId: string): Promise<void> {
    await this.client.auth.admin.deleteUser(authUserId);
  }

  /**
   * Sets a new password on an account, as a manager issuing one to a student.
   *
   * Deliberately does not revoke the account's existing sessions. A child
   * working through a problem should not be thrown out of it because an office
   * computer clicked a button; the new password is for the next sign-in.
   */
  async setPassword(authUserId: string, password: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(authUserId, {
      password,
    });
    if (error) {
      throw new AppException(
        "STUDENT_CREDENTIAL_TARGET_INVALID",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * What sign-in methods this account actually has.
   *
   * Read from Supabase rather than inferred in the browser: an OAuth-only
   * account has no password to change, and My Page must not render a form
   * that fails only after the person has typed a new password twice.
   *
   * A failure here is reported as "no identities known" rather than thrown.
   * The security section degrades to read-only status; the rest of My Page has
   * nothing to do with Supabase and must still load.
   */
  async describeIdentities(
    authUserId: string,
  ): Promise<{ providers: string[]; hasPasswordIdentity: boolean }> {
    const empty = { providers: [], hasPasswordIdentity: false };
    try {
      const { data, error } = await this.client.auth.admin.getUserById(
        authUserId,
      );
      if (error || !data?.user) return empty;
      const providers = (data.user.identities ?? [])
        .map((identity) => identity.provider)
        .filter((provider): provider is string => Boolean(provider));
      return {
        providers: providers.filter((provider) => provider !== "email"),
        hasPasswordIdentity: providers.includes("email"),
      };
    } catch {
      return empty;
    }
  }

  /**
   * Whether an auth user can recover an email/password credential.
   *
   * Unlike `describeIdentities`, this preserves provider unavailability. My
   * Page may safely degrade to read-only identity copy, but password recovery
   * must alert when an outage would silently suppress every legitimate email.
   */
  async passwordIdentityStatus(
    authUserId: string,
  ): Promise<PasswordIdentityStatus> {
    try {
      const { data, error } = await this.client.auth.admin.getUserById(
        authUserId,
      );
      if (error) {
        return error.status === 404 || error.code === "user_not_found"
          ? "absent"
          : "unavailable";
      }
      if (!data?.user) return "unavailable";
      return (data.user.identities ?? []).some(
        (identity) => identity.provider === "email",
      )
        ? "present"
        : "absent";
    } catch {
      return "unavailable";
    }
  }

  /**
   * Asks Supabase to send a recovery email, and reports only whether the call
   * itself completed.
   *
   * The caller passes a real address for an account that can recover and a
   * synthetic one for every other case, so this must behave identically for
   * both: no branch here may depend on whether the address belongs to anyone.
   * The client is the secret-key client, which neither persists nor refreshes
   * a session, so the requester's browser gains no PKCE state from a recovery
   * request.
   */
  async sendPasswordRecoveryEmail(
    email: string,
    redirectTo: string,
    captchaToken?: string,
  ): Promise<{ delivered: boolean }> {
    try {
      const { error } = await this.client.auth.resetPasswordForEmail(email, {
        redirectTo,
        ...(captchaToken ? { captchaToken } : {}),
      });
      return { delivered: !error };
    } catch {
      return { delivered: false };
    }
  }
}

function firstUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
    ? value.toLowerCase()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstUrl(...values: unknown[]): string | null {
  const value = firstString(...values);
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}
