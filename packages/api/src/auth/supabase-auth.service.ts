import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseUsername } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import type { SupabaseIdentity } from "./auth.types.js";

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
