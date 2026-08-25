import { describe, expect, it } from "vitest";

import { requireConfirmation } from "./cli.js";
import { decideBootstrap, type DesiredBootstrapAccount, type ExistingBootstrapAccount } from "./decision.js";

const desired = [
  { username: "mapo-teamlead", email: "mapo-teamlead@temporary.invalid", displayName: "Mapo Team Lead", role: "TEAM_LEAD" },
  { username: "mapo-teacher", email: "mapo-teacher@temporary.invalid", displayName: "Mapo Teacher", role: "TEACHER" },
] as const satisfies readonly DesiredBootstrapAccount[];
const academyId = "eec3d5ca-cda7-4638-8875-c871e16b5c22";

function complete(account: DesiredBootstrapAccount): ExistingBootstrapAccount {
  return {
    coveUserId: `${account.username}-user`, coveAuthUserId: `${account.username}-auth`,
    coveUsername: account.username, coveEmail: account.email, coveStatus: "ACTIVE",
    authUserId: `${account.username}-auth`, authEmail: account.email,
    membershipAcademyId: academyId, membershipRole: account.role, membershipStatus: "ACTIVE",
  };
}

describe("DLAB Mapo bootstrap decision", () => {
  it("accepts the separator forwarded by pnpm", () => {
    expect(() => requireConfirmation(["--", "--confirm-academy=dlab-mapo"])).not.toThrow();
  });

  it("creates only when neither account exists", () => {
    expect(decideBootstrap(desired, new Map(), academyId)).toEqual({ kind: "create" });
  });

  it("recognizes an exact completed bootstrap", () => {
    const existing = new Map(desired.map((account) => [account.username, complete(account)]));
    expect(decideBootstrap(desired, existing, academyId)).toEqual({ kind: "already-complete" });
  });

  it("stops on a partial bootstrap", () => {
    expect(decideBootstrap(desired, new Map([[desired[0].username, complete(desired[0])]]), academyId)).toEqual({
      kind: "conflict", reasons: ["Only part of the bootstrap already exists."],
    });
  });

  it("stops rather than changing an existing role", () => {
    const existing = new Map(desired.map((account) => [account.username, complete(account)]));
    existing.get("mapo-teacher")!.membershipRole = "MANAGER";
    expect(decideBootstrap(desired, existing, academyId)).toEqual({
      kind: "conflict", reasons: ["mapo-teacher: role differs."],
    });
  });
});
