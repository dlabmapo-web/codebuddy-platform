import { describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { PrismaService } from "../database/prisma.service.js";
import { LeadScopeService } from "./lead-scope.service.js";

/**
 * The gate, tested as a gate.
 *
 * Every refusal below answers with the same code on purpose, so a caller cannot
 * map the platform by reading which error came back — "you are not a team lead
 * here" and "that academy does not exist" have to be indistinguishable.
 */

const identity = { authUserId: "auth" } as SupabaseIdentity;
const academyId = "20000000-0000-4000-8000-000000000001";

function createService(overrides?: {
  role?: string;
  /** Every role held, when it differs from `[role]` — a multi-role member. */
  roles?: string[];
  denied?: boolean;
  timeZone?: string | null;
}) {
  const role = overrides?.role ?? "TEAM_LEAD";
  const requirePermission = overrides?.denied
    ? vi.fn().mockRejectedValue(new AppException("ACADEMY_MEMBERSHIP_REQUIRED", 403))
    : vi.fn().mockResolvedValue({
        userId: "lead-user",
        role,
        roles: overrides?.roles ?? [role],
      });

  const prisma = {
    academy: {
      findUnique: vi.fn().mockResolvedValue(
        overrides?.timeZone === null
          ? null
          : { timeZone: overrides?.timeZone ?? "Asia/Seoul" },
      ),
    },
  } as unknown as PrismaService;

  const access = { requirePermission } as unknown as AcademyAccessService;
  return {
    service: new LeadScopeService(prisma, access),
    requirePermission,
  };
}

async function denialCodeFor(
  role: string,
  roles?: string[],
): Promise<string> {
  const { service } = createService({ role, roles });
  try {
    await service.requireTeamLead(identity, academyId, "curriculum.manage");
    return "NOT_DENIED";
  } catch (error) {
    return error instanceof AppException ? error.code : "WRONG_ERROR";
  }
}

describe("LeadScopeService", () => {
  /*
   * The regression this guards: a Manager granted TEAM_LEAD holds
   * `role = MANAGER`, because the membership row stores only the highest role.
   * Comparing that primary role refused them the curriculum overview the second
   * grant exists to give, and the page rendered "The control tower could not
   * load" with no way forward.
   */
  it("admits a manager who also holds team lead", async () => {
    const { service } = createService({
      role: "MANAGER",
      roles: ["TEACHER", "TEAM_LEAD", "MANAGER"],
    });
    await expect(
      service.requireTeamLead(identity, academyId, "curriculum.manage"),
    ).resolves.toMatchObject({ userId: "lead-user" });
  });

  it("still refuses a manager who does not hold team lead", async () => {
    expect(await denialCodeFor("MANAGER", ["MANAGER"])).toBe(
      "CURRICULUM_OVERVIEW_ACCESS_DENIED",
    );
  });

  it("admits an active team lead and carries the academy's own zone", async () => {
    const { service, requirePermission } = createService();
    const actor = await service.requireTeamLead(
      identity,
      academyId,
      "curriculum.manage",
    );

    expect(actor).toEqual({
      userId: "lead-user",
      academyId,
      timeZone: "Asia/Seoul",
    });
    // The named capability, not a role string, is what is asked for.
    expect(requirePermission).toHaveBeenCalledWith(
      "auth",
      academyId,
      "curriculum.manage",
    );
  });

  /**
   * The one exclusion a future reader is most likely to mistake for an
   * oversight, so it gets its own test and its own explanation.
   *
   * The 2026-07-24 content migration design says a manager "inherits Team Lead
   * content permissions as an operational override". The permission map never
   * implemented that, and the manager keeps the control tower — which answers
   * their question rather than a narrower version of this one.
   */
  it("refuses a MANAGER, who keeps the control tower instead", async () => {
    await expect(denialCodeFor("MANAGER")).resolves.toBe(
      "CURRICULUM_OVERVIEW_ACCESS_DENIED",
    );
  });

  it("refuses every other academy role", async () => {
    await expect(denialCodeFor("TEACHER")).resolves.toBe(
      "CURRICULUM_OVERVIEW_ACCESS_DENIED",
    );
    await expect(denialCodeFor("STUDENT")).resolves.toBe(
      "CURRICULUM_OVERVIEW_ACCESS_DENIED",
    );
  });

  /**
   * A suspended membership, another academy's id, and a platform admin with no
   * membership all fail inside `requirePermission` — which reads the membership
   * rather than the platform role. They are one case here because they must be
   * one case to the caller.
   */
  it("answers a refused permission with the same code as a wrong role", async () => {
    const { service } = createService({ denied: true });
    await expect(
      service.requireTeamLead(identity, academyId, "curriculum.manage"),
    ).rejects.toMatchObject({ code: "CURRICULUM_OVERVIEW_ACCESS_DENIED" });
  });

  it("falls back to the platform zone rather than failing on a missing academy", async () => {
    const { service } = createService({ timeZone: null });
    const actor = await service.requireTeamLead(
      identity,
      academyId,
      "curriculum.manage",
    );
    expect(actor.timeZone).toBeTruthy();
  });
});
