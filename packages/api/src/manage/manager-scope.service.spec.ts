import type { AcademyRole } from "@cove/shared";
import { rolesHavePermission } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";

const academyId = "11111111-2222-4333-8444-555555555555";
const identity = { authUserId: "auth" } as SupabaseIdentity;

/**
 * An academy where the actor holds these roles.
 *
 * `requirePermission` is modelled as the real one is: it decides on the
 * *effective* role set through the real permission map, and returns both the
 * membership's own `role` column and that set. The two are deliberately
 * allowed to disagree here, because a Teacher carrying Team Lead as an extra
 * role is exactly the case that used to be admitted by the web gate and then
 * refused by the service.
 */
function build(input: {
  /** The membership's own column — its primary role. */
  role: AcademyRole;
  /** Every role held, which is what authorization is decided on. */
  roles?: readonly AcademyRole[];
  /** Overrides the permission map, for a rule that no real role exercises. */
  permissions?: readonly string[];
}) {
  const roles = input.roles ?? [input.role];
  const requirePermission = vi.fn(
    async (_authUserId: string, _academyId: string, permission: string) => {
      const held = input.permissions
        ? input.permissions.includes(permission)
        : rolesHavePermission(roles, permission as never);
      if (!held) throw new Error("denied");
      return {
        userId: "user",
        academyId,
        role: input.role,
        roles,
        via: "membership" as const,
      };
    },
  );
  const access = { requirePermission } as unknown as AcademyAccessService;
  const prisma = {
    academy: { findUnique: vi.fn(async () => ({ timeZone: "Asia/Seoul" })) },
  } as unknown as PrismaService;

  return {
    requirePermission,
    service: new ManagerScopeService(prisma, access),
  };
}

describe("ManagerScopeService.requireMemberReader", () => {
  it("admits a manager, and says they may manage members", async () => {
    const { service } = build({ role: "MANAGER" });

    await expect(
      service.requireMemberReader(identity, academyId),
    ).resolves.toMatchObject({ academyId, canManageMembers: true });
  });

  it("admits a team lead, and says they may not manage members", async () => {
    const { service } = build({ role: "TEAM_LEAD" });

    await expect(
      service.requireMemberReader(identity, academyId),
    ).resolves.toMatchObject({ academyId, canManageMembers: false });
  });

  it("admits a teacher carrying team lead as an extra role", async () => {
    // Decided on the role *set*, as `academy.members.read` itself is and as
    // `canReadAcademyMembers` is in the web gate. Reading the membership's
    // `role` column instead would show this person both roster links and then
    // refuse them at the service — admitted by one rule, turned away by
    // another.
    const { service } = build({ role: "TEACHER", roles: ["TEAM_LEAD", "TEACHER"] });

    await expect(
      service.requireMemberReader(identity, academyId),
    ).resolves.toMatchObject({ academyId, canManageMembers: false });
  });

  it("refuses a teacher", async () => {
    // A teacher holds no `academy.members.read`, so the permission alone
    // already stops them. The next test is the one that matters.
    const { service } = build({ role: "TEACHER" });

    await expect(
      service.requireMemberReader(identity, academyId),
    ).rejects.toThrow();
  });

  it("refuses a role that holds the permission but is not on the list", async () => {
    // The explicit conjunction, tested as a rule rather than as a consequence.
    // If `academy.members.read` is ever granted to another role, that role does
    // not thereby get the rosters — admitting it stays a deliberate edit to
    // `requireMemberReader`, which is the property `requireManager`'s own
    // comment asks for.
    const { service } = build({
      role: "STUDENT",
      permissions: ["academy.members.read"],
    });

    await expect(
      service.requireMemberReader(identity, academyId),
    ).rejects.toThrow();
  });

  it("asks the permission map once, not once per question", async () => {
    // `canManageMembers` is answered from the roles the first call already
    // resolved. A second `requirePermission` would be a second user read and
    // a second membership read to learn something it was handed.
    const { service, requirePermission } = build({ role: "MANAGER" });

    await service.requireMemberReader(identity, academyId);

    expect(requirePermission.mock.calls.map((call) => call[2])).toEqual([
      "academy.members.read",
    ]);
  });
});
