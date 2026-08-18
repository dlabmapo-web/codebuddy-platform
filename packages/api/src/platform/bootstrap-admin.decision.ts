/**
 * Whether this run may promote anybody, decided without touching the world.
 *
 * Separated from the command so every refusal in §16 of the authorization
 * design — wrong environment, absent configuration, unverified identity — is
 * exercisable in a unit test. The most privileged operation in the product is
 * the worst place for the only proof to be "we ran it once and it seemed
 * fine".
 */
export type BootstrapAccount = {
  id: string;
  status: "PENDING_PROFILE" | "ACTIVE" | "SUSPENDED" | "DELETED";
  platformRole: "USER" | "ADMIN";
  /** Null when the Cove profile has never been linked to a Supabase identity. */
  authUserId: string | null;
};

export type BootstrapDecision =
  | { kind: "promote"; userId: string }
  | { kind: "already_admin"; userId: string }
  | { kind: "not_configured" }
  | { kind: "environment_mismatch"; expected: string; actual: string }
  | { kind: "unknown_account"; email: string }
  | { kind: "no_identity"; email: string }
  | { kind: "unverified_identity"; email: string }
  | { kind: "account_unavailable"; email: string; status: string };

export function decideBootstrap(input: {
  configuredEmail: string | undefined;
  configuredEnvironment: string | undefined;
  runningEnvironment: string;
  account: BootstrapAccount | null;
  /** From the Supabase identity, not from Cove — Cove stores no such flag. */
  identityEmailVerified: boolean;
}): BootstrapDecision {
  if (!input.configuredEmail || !input.configuredEnvironment) {
    return { kind: "not_configured" };
  }
  if (input.configuredEnvironment !== input.runningEnvironment) {
    return {
      kind: "environment_mismatch",
      expected: input.configuredEnvironment,
      actual: input.runningEnvironment,
    };
  }

  const email = normalizeBootstrapEmail(input.configuredEmail);
  if (!input.account) return { kind: "unknown_account", email };
  if (!input.account.authUserId) return { kind: "no_identity", email };
  if (!input.identityEmailVerified) {
    return { kind: "unverified_identity", email };
  }
  if (input.account.status !== "ACTIVE") {
    return {
      kind: "account_unavailable",
      email,
      status: input.account.status,
    };
  }

  // Idempotent by §16: a second run is a no-op that still exits successfully,
  // so a retried deploy step never fails on work that is already done.
  if (input.account.platformRole === "ADMIN") {
    return { kind: "already_admin", userId: input.account.id };
  }
  return { kind: "promote", userId: input.account.id };
}

export function normalizeBootstrapEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Refusals exit non-zero; the two success shapes exit 0. */
export function isBootstrapRefusal(decision: BootstrapDecision): boolean {
  return decision.kind !== "promote" && decision.kind !== "already_admin";
}

export function describeBootstrapDecision(decision: BootstrapDecision): string {
  switch (decision.kind) {
    case "promote":
      return `Promoted ${decision.userId} to platform ADMIN.`;
    case "already_admin":
      return `${decision.userId} is already a platform ADMIN. Nothing to do.`;
    case "not_configured":
      return "Refused: set PLATFORM_BOOTSTRAP_ADMIN_EMAIL and PLATFORM_BOOTSTRAP_ENV to enable this command.";
    case "environment_mismatch":
      return `Refused: PLATFORM_BOOTSTRAP_ENV is "${decision.expected}" but NODE_ENV is "${decision.actual}".`;
    case "unknown_account":
      return `Refused: no Cove account for ${decision.email}. Sign up first, then run this again.`;
    case "no_identity":
      return `Refused: ${decision.email} has no linked Supabase identity.`;
    case "unverified_identity":
      return `Refused: ${decision.email} has not verified their email.`;
    case "account_unavailable":
      return `Refused: ${decision.email} is ${decision.status}, not ACTIVE.`;
  }
}
