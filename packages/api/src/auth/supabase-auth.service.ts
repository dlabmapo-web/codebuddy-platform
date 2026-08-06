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
