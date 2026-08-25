export interface DesiredBootstrapAccount {
  username: string;
  email: string;
  displayName: string;
  role: "TEAM_LEAD" | "TEACHER";
}

export interface ExistingBootstrapAccount {
  coveUserId: string | null;
  coveAuthUserId: string | null;
  coveUsername: string | null;
  coveEmail: string | null;
  coveStatus: string | null;
  authUserId: string | null;
  authEmail: string | null;
  membershipAcademyId: string | null;
  membershipRole: string | null;
  membershipStatus: string | null;
}

export type BootstrapDecision =
  | { kind: "create" }
  | { kind: "already-complete" }
  | { kind: "conflict"; reasons: string[] };

export function decideBootstrap(
  desired: readonly DesiredBootstrapAccount[],
  existingByUsername: ReadonlyMap<string, ExistingBootstrapAccount>,
  academyId: string,
): BootstrapDecision {
  const present = desired.filter((account) => existingByUsername.has(account.username));
  if (present.length === 0) return { kind: "create" };
  if (present.length !== desired.length) {
    return { kind: "conflict", reasons: ["Only part of the bootstrap already exists."] };
  }

  const reasons: string[] = [];
  for (const account of desired) {
    const current = existingByUsername.get(account.username)!;
    const label = account.username;
    if (!current.coveUserId) reasons.push(`${label}: Cove user is missing.`);
    if (current.coveUsername !== account.username) reasons.push(`${label}: username differs.`);
    if (current.coveEmail !== account.email) reasons.push(`${label}: email differs.`);
    if (current.coveStatus !== "ACTIVE") reasons.push(`${label}: Cove user is not active.`);
    if (!current.authUserId || current.authUserId !== current.coveAuthUserId) reasons.push(`${label}: Auth identity differs.`);
    if (current.authEmail !== account.email) reasons.push(`${label}: Auth email differs.`);
    if (current.membershipAcademyId !== academyId) reasons.push(`${label}: academy differs.`);
    if (current.membershipRole !== account.role) reasons.push(`${label}: role differs.`);
    if (current.membershipStatus !== "ACTIVE") reasons.push(`${label}: membership is not active.`);
  }
  return reasons.length ? { kind: "conflict", reasons } : { kind: "already-complete" };
}
