import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { ApiEnvironment } from "../config/env.schema.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PasswordRecoveryService } from "./password-recovery.service.js";
import type { SupabaseAuthService } from "./supabase-auth.service.js";

type UserRow = {
  authUserId: string | null;
  email: string | null;
  status: string;
};

const passwordUser: UserRow = {
  authUserId: "30000000-0000-4000-8000-000000000001",
  email: "minsu@example.com",
  status: "ACTIVE",
};

function createService(options: {
  user?: UserRow | null;
  identityStatus?: "present" | "absent" | "unavailable";
  delivered?: boolean;
} = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options.user === undefined ? passwordUser : options.user,
      ),
    },
  } as unknown as PrismaService;

  const supabaseAuth = {
    passwordIdentityStatus: vi.fn().mockResolvedValue(
      options.identityStatus ?? "present",
    ),
    sendPasswordRecoveryEmail: vi.fn().mockResolvedValue({
      delivered: options.delivered ?? true,
    }),
  } as unknown as SupabaseAuthService;

  const config = {
    get: () => "https://studio.test",
  } as unknown as ConfigService<ApiEnvironment, true>;

  return {
    prisma,
    supabaseAuth,
    service: new PasswordRecoveryService(prisma, supabaseAuth, config),
  };
}

function sentAddress(supabaseAuth: SupabaseAuthService): string {
  return vi.mocked(supabaseAuth.sendPasswordRecoveryEmail).mock.calls[0][0];
}

describe("PasswordRecoveryService", () => {
  it("dispatches a password account to its stored address", async () => {
    const { service, supabaseAuth } = createService();

    const { outcome } = await service.request("minsu01");

    expect(outcome).toBe("delivered");
    expect(supabaseAuth.sendPasswordRecoveryEmail).toHaveBeenCalledWith(
      "minsu@example.com",
      "https://studio.test/auth/recovery/confirm",
      undefined,
    );
  });

  it("forwards a captcha token to the provider and nowhere else", async () => {
    const { service, supabaseAuth } = createService();

    await service.request("minsu01", "captcha-token");

    expect(supabaseAuth.sendPasswordRecoveryEmail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "captcha-token",
    );
  });

  it.each([
    ["an unknown username", { user: null }],
    ["a suspended account", { user: { ...passwordUser, status: "SUSPENDED" } }],
    ["a deleted account", { user: { ...passwordUser, status: "DELETED" } }],
    ["an account with no address", { user: { ...passwordUser, email: null } }],
    ["an unlinked account", { user: { ...passwordUser, authUserId: null } }],
    ["an OAuth-only account", { identityStatus: "absent" as const }],
  ])("still calls the provider for %s, with nowhere to deliver", async (
    _case,
    options,
  ) => {
    const { service, supabaseAuth } = createService(options);

    const { outcome } = await service.request("minsu01");

    expect(outcome).toBe("undeliverable");
    expect(supabaseAuth.sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
    expect(sentAddress(supabaseAuth)).toMatch(
      /^[0-9a-f]{32}@unresolved\.invalid$/,
    );
    expect(supabaseAuth.passwordIdentityStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps an identity-service outage visible internally", async () => {
    const { service, supabaseAuth } = createService({
      identityStatus: "unavailable",
    });

    const { outcome } = await service.request("minsu01");

    expect(outcome).toBe("identity_unavailable");
    expect(sentAddress(supabaseAuth)).toMatch(
      /^[0-9a-f]{32}@unresolved\.invalid$/,
    );
  });

  it("pays for one identity lookup even when the username is unknown", async () => {
    const { service, supabaseAuth } = createService({ user: null });

    await service.request("minsu01");

    expect(supabaseAuth.passwordIdentityStatus).toHaveBeenCalledTimes(1);
    expect(supabaseAuth.passwordIdentityStatus).toHaveBeenCalledWith(
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );
  });

  it("keeps the raw username out of the undeliverable address", async () => {
    const { service, supabaseAuth } = createService({ user: null });

    await service.request("minsu01");

    expect(sentAddress(supabaseAuth)).not.toContain("minsu01");
  });

  it("reports a provider failure without changing what was attempted", async () => {
    const { service, supabaseAuth } = createService({ delivered: false });

    const { outcome } = await service.request("minsu01");

    expect(outcome).toBe("provider_failed");
    expect(supabaseAuth.sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
  });

  it("digests a username stably, irreversibly, and distinctly", () => {
    const digest = PasswordRecoveryService.usernameDigest("minsu01");

    expect(digest).toBe(PasswordRecoveryService.usernameDigest("minsu01"));
    expect(digest).not.toContain("minsu01");
    expect(digest).not.toBe(PasswordRecoveryService.usernameDigest("minsu02"));
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
  });
});
