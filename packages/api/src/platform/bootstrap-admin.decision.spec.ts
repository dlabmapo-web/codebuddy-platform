import { describe, expect, it } from "vitest";

import {
  decideBootstrap,
  isBootstrapRefusal,
  type BootstrapAccount,
} from "./bootstrap-admin.decision.js";

const account: BootstrapAccount = {
  id: "40000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
  platformRole: "USER",
  authUserId: "50000000-0000-4000-8000-000000000001",
};

function decide(overrides: Partial<Parameters<typeof decideBootstrap>[0]> = {}) {
  return decideBootstrap({
    configuredEmail: "operator@coveedu.com",
    configuredEnvironment: "development",
    runningEnvironment: "development",
    account,
    identityEmailVerified: true,
    ...overrides,
  });
}

describe("decideBootstrap", () => {
  it("promotes a verified, active account", () => {
    expect(decide()).toEqual({ kind: "promote", userId: account.id });
  });

  it("is idempotent for an account that is already an admin", () => {
    const decision = decide({
      account: { ...account, platformRole: "ADMIN" },
    });
    expect(decision).toEqual({ kind: "already_admin", userId: account.id });
    expect(isBootstrapRefusal(decision)).toBe(false);
  });

  it("refuses when either configuration variable is absent", () => {
    expect(decide({ configuredEmail: undefined }).kind).toBe("not_configured");
    expect(decide({ configuredEnvironment: undefined }).kind)
      .toBe("not_configured");
  });

  it("refuses when the configured environment is not the running one", () => {
    // The reason this check exists: a .env copied from staging must not be
    // able to promote anybody in production.
    expect(
      decide({
        configuredEnvironment: "development",
        runningEnvironment: "production",
      }),
    ).toEqual({
      kind: "environment_mismatch",
      expected: "development",
      actual: "production",
    });
  });

  it("refuses an unknown, unlinked, or unverified account", () => {
    expect(decide({ account: null }).kind).toBe("unknown_account");
    expect(decide({ account: { ...account, authUserId: null } }).kind)
      .toBe("no_identity");
    expect(decide({ identityEmailVerified: false }).kind)
      .toBe("unverified_identity");
  });

  it("refuses an account that is not active", () => {
    for (const status of ["PENDING_PROFILE", "SUSPENDED", "DELETED"] as const) {
      expect(decide({ account: { ...account, status } })).toEqual({
        kind: "account_unavailable",
        email: "operator@coveedu.com",
        status,
      });
    }
  });

  it("normalizes the configured email before reporting it", () => {
    expect(
      decide({ configuredEmail: "  Operator@CoveEdu.com  ", account: null }),
    ).toEqual({ kind: "unknown_account", email: "operator@coveedu.com" });
  });

  it("treats every refusal as a non-zero exit", () => {
    expect(isBootstrapRefusal(decide({ account: null }))).toBe(true);
    expect(isBootstrapRefusal(decide())).toBe(false);
  });
});
