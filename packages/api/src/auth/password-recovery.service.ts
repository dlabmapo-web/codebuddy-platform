import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../database/prisma.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

/**
 * Where a recovery request that cannot be delivered is sent instead.
 *
 * `.invalid` is reserved by RFC 2606, so the address can never reach anybody.
 * Sending to it anyway is the point: an unknown username, an OAuth-only
 * account, and a suspended one all take the same code path, at roughly the
 * same cost, as a password account. Skipping the call for those would leave a
 * timing difference where the response body no longer leaks one.
 */
const undeliverableDomain = "unresolved.invalid";

/** What a recovery request did, for operational counters only. */
export type RecoveryOutcome =
  | "delivered"
  | "undeliverable"
  | "identity_unavailable"
  | "provider_failed";

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    config: ConfigService<ApiEnvironment, true>,
  ) {
    this.webOrigin = config.get("WEB_ORIGIN", { infer: true });
  }

  /**
   * A stable, non-reversible identifier for a username, for rate-limiter keys.
   *
   * The limiter has to count attempts per account without holding the names it
   * counts: a limiter map is dumped into a heap snapshot or a debug endpoint
   * far more casually than a database is, and a list of the usernames somebody
   * tried to recover is exactly the enumeration this design refuses elsewhere.
   */
  static usernameDigest(username: string): string {
    return createHash("sha256")
      .update(`cove:recovery-subject:v1\0${username}`)
      .digest("hex")
      .slice(0, 32);
  }

  /**
   * Dispatches a Supabase recovery email for a username, if that username can
   * recover one.
   *
   * The return value describes only what happened to the provider call. It is
   * never derived from whether the account exists, and the router does not put
   * it on the wire — `{ accepted: true }` is the whole public answer.
   */
  async request(
    username: string,
    captchaToken?: string,
  ): Promise<{ outcome: RecoveryOutcome }> {
    const target = await this.recoveryTarget(username);
    const { delivered } = await this.supabaseAuth.sendPasswordRecoveryEmail(
      target.email ?? this.undeliverableAddress(username),
      `${this.webOrigin}/auth/recovery/confirm`,
      captchaToken,
    );

    if (target.identityUnavailable) {
      this.logger.error("Password recovery identity lookup unavailable");
      return { outcome: "identity_unavailable" };
    }
    if (!target.email) return { outcome: "undeliverable" };
    if (!delivered) {
      // No username, address, or provider body: a recovery log line that named
      // the account would be the enumeration oracle the response is not.
      this.logger.error("Password recovery provider call failed");
      return { outcome: "provider_failed" };
    }
    return { outcome: "delivered" };
  }

  /**
   * The address that should receive recovery mail for this username, or null
   * when nothing should.
   *
   * `SUSPENDED` and `DELETED` accounts are not recovery targets — a password
   * reset is how a suspended account would try to walk back in. An account
   * with no `email` password identity in Supabase has nothing to reset, so an
   * OAuth-only user is told to sign in with their provider by the login page,
   * not handed a password by this flow.
   */
  private async recoveryTarget(username: string): Promise<{
    email: string | null;
    identityUnavailable: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { authUserId: true, email: true, status: true },
    });
    // Every well-formed username pays for one Supabase identity lookup. Without
    // the synthetic id, a known active account has one more network round trip
    // than an unknown or suspended name and becomes measurable by timing.
    const identity = await this.supabaseAuth.passwordIdentityStatus(
      user?.authUserId ?? randomUUID(),
    );
    if (identity === "unavailable") {
      return { email: null, identityUnavailable: true };
    }

    const usableStatus =
      user?.status === "ACTIVE" || user?.status === "PENDING_PROFILE";
    return {
      email:
        user?.authUserId &&
        user.email &&
        usableStatus &&
        identity === "present"
          ? user.email
          : null,
      identityUnavailable: false,
    };
  }

  private undeliverableAddress(username: string): string {
    return `${PasswordRecoveryService.usernameDigest(username)}@${undeliverableDomain}`;
  }
}
