import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { ApiEnvironment } from "../config/env.schema.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

function createService() {
  const config = {
    get: (key: string) =>
      key === "SUPABASE_URL"
        ? "https://example.supabase.co"
        : "test-service-role-key",
  } as ConfigService<ApiEnvironment, true>;
  const service = new SupabaseAuthService(config);
  const getUserById = vi.fn();

  Object.defineProperty(service, "client", {
    value: { auth: { admin: { getUserById } } },
  });

  return { getUserById, service };
}

describe("SupabaseAuthService.passwordIdentityStatus", () => {
  it("returns present when the user has an email identity", async () => {
    const { getUserById, service } = createService();
    getUserById.mockResolvedValue({
      data: { user: { identities: [{ provider: "email" }] } },
      error: null,
    });

    await expect(service.passwordIdentityStatus("auth-user-id")).resolves.toBe(
      "present",
    );
  });

  it("returns absent when the user only has social identities", async () => {
    const { getUserById, service } = createService();
    getUserById.mockResolvedValue({
      data: { user: { identities: [{ provider: "google" }] } },
      error: null,
    });

    await expect(service.passwordIdentityStatus("auth-user-id")).resolves.toBe(
      "absent",
    );
  });

  it("returns absent when Supabase reports that the user does not exist", async () => {
    const { getUserById, service } = createService();
    getUserById.mockResolvedValue({
      data: { user: null },
      error: { code: "user_not_found", status: 404 },
    });

    await expect(service.passwordIdentityStatus("missing-user-id")).resolves.toBe(
      "absent",
    );
  });

  it("returns unavailable for an identity-service failure", async () => {
    const { getUserById, service } = createService();
    getUserById.mockResolvedValue({
      data: { user: null },
      error: { code: "unexpected_failure", status: 503 },
    });

    await expect(service.passwordIdentityStatus("auth-user-id")).resolves.toBe(
      "unavailable",
    );
  });

  it("returns unavailable when the identity request throws", async () => {
    const { getUserById, service } = createService();
    getUserById.mockRejectedValue(new Error("network unavailable"));

    await expect(service.passwordIdentityStatus("auth-user-id")).resolves.toBe(
      "unavailable",
    );
  });
});
