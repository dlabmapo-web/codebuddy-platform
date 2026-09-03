import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ApiEnvironment } from "../config/env.schema.js";

const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Cloudflare Turnstile, verified by Cove rather than by Supabase.
 *
 * Every other signup path hands its token to `supabase.auth.signUp`, which
 * checks it. The student path cannot: it creates the identity through the
 * service-role admin API, and a service-role call bypasses the project's
 * captcha protection entirely. Without this, the one endpoint that makes an
 * account without an email would be the one endpoint with nothing standing in
 * front of it.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret: string | null;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.secret = config.get("TURNSTILE_SECRET_KEY", { infer: true }) ?? null;
  }

  /** Whether this deployment challenges at all. */
  get enabled(): boolean {
    return this.secret !== null;
  }

  /**
   * Whether this token is a genuine, unspent solution.
   *
   * Answers `true` when no secret is configured — a development machine has no
   * Turnstile keys and must still be able to create a student. It is the
   * deployment's job to hold the secret, and §6 of the deployment guide says
   * where it goes.
   *
   * A network failure reaching Cloudflare answers `false`. Failing open here
   * would mean an attacker who can disrupt one outbound request gets an
   * unprotected signup endpoint, which is precisely the request they would
   * choose to disrupt.
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.secret) return true;
    if (!token) return false;

    try {
      const body = new URLSearchParams({ secret: this.secret, response: token });
      if (remoteIp) body.set("remoteip", remoteIp);
      const response = await fetch(verifyUrl, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch {
      this.logger.error("Turnstile verification could not be completed");
      return false;
    }
  }
}
