import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("SupabaseAuthService.setPassword", () => {
  function withUpdate(result: unknown) {
    const { service } = createService();
    const updateUserById = vi.fn().mockResolvedValue(result);
    Object.defineProperty(service, "client", {
      value: { auth: { admin: { updateUserById } } },
    });
    return { service, updateUserById };
  }

  it("reports a password Supabase finds too weak as rejected, not as a bad target", async () => {
    const { service } = withUpdate({
      data: { user: null },
      error: { code: "weak_password", status: 422 },
    });

    await expect(
      service.setPassword("auth-user-id", "password"),
    ).rejects.toMatchObject({ code: "STUDENT_PASSWORD_REJECTED" });
  });

  it("keeps every other refusal as a target failure", async () => {
    const { service } = withUpdate({
      data: { user: null },
      error: { code: "user_not_found", status: 404 },
    });

    await expect(
      service.setPassword("auth-user-id", "minji1234"),
    ).rejects.toMatchObject({ code: "STUDENT_CREDENTIAL_TARGET_INVALID" });
  });
});


describe("user-scoped security changes", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("requests confirmation with the user's bearer token, never an admin email update", async () => {
    const { service } = createService();
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await service.requestEmailChange("user-token", "new@example.com");
    expect(fetcher).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", expect.objectContaining({
      method: "PUT", headers: expect.objectContaining({ Authorization: "Bearer user-token" }), body: JSON.stringify({ email: "new@example.com" }),
    }));
  });
  it("reports provider rate limiting without claiming success", async () => {
    const { service } = createService();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(service.requestEmailChange("token", "new@example.com")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
  it.each([
    ["google", [{ provider: "google", identity_id: "one" }]],
    ["email", [{ provider: "email", identity_id: "one" }, { provider: "google", identity_id: "two" }]],
    ["naver", [{ provider: "email", identity_id: "one" }, { provider: "google", identity_id: "two" }]],
  ])("refuses unlinking %s when it is last, not social, or not owned", async (provider, identities) => {
    const { service } = createService();
    Object.defineProperty(service, "client", { value: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner", identities } }, error: null }) } } });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(service.unlinkProvider("token", "owner", provider)).rejects.toMatchObject({ code: "PROFILE_LAST_IDENTITY_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("resolves the current identity id server-side and retains the other method", async () => {
    const { service } = createService();
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "owner", identities: [{ provider: "email", identity_id: "email-id" }, { provider: "google", identity_id: "google-id" }] } }, error: null });
    Object.defineProperty(service, "client", { value: { auth: { getUser } } });
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await service.unlinkProvider("user-token", "owner", "google");
    expect(getUser).toHaveBeenCalledWith("user-token");
    expect(fetcher).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user/identities/google-id", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ Authorization: "Bearer user-token" }) }));
  });
});
