import type { AcademyRole } from "@cove/shared";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ACADEMY_TIME_ZONE, type AcademyPermission } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * The one gate in front of the Team Lead's curriculum overview.
 *
 * §5's rule, made structural. `curriculum.manage` is held by `TEAM_LEAD` and by
 * nobody else, so the named permission alone already excludes every other role
 * — and the explicit conjunction below is still here, for the same reason
 * `ManagerScopeService` carries one: a permission map is edited by people
 * solving a different problem, and the day `curriculum.manage` is granted to a
 * second role for some authoring reason, this surface must not silently widen
 * with it.
 *
 * **Managers are refused here on purpose.** The 2026-07-24 content migration
 * design says a `MANAGER` "inherits Team Lead content permissions as an
 * operational override", but `academyRolePermissions` never implemented that:
 * a manager holds `curriculum.read` and `curriculum.review` and neither
 * `curriculum.manage` nor `curriculum.publish` nor `exercises.manage`. The
 * permission map is the truth, the older sentence is stale, and a manager keeps
 * the control tower — which answers their question and not this one.
 *
 * A platform `ADMIN` without an active Team Lead membership is refused like
 * anyone else: `requirePermission` reads the membership, not the platform role.
 *
 * Every failure — no membership, a suspended one, the wrong role, another
 * academy's id — answers with one code, so a caller cannot map the platform by
 * reading which refusal came back.
 */

export type TeamLeadActor = {
  userId: string;
  academyId: string;
  /** The academy's own zone. Every local day on this page is drawn in it. */
  timeZone: string;
};

@Injectable()
export class LeadScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async requireTeamLead(
    identity: SupabaseIdentity,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<TeamLeadActor> {
    let actor: { userId: string; role: string; roles: readonly AcademyRole[] };
    try {
      actor = await this.access.requirePermission(
        identity.authUserId,
        academyId,
        permission,
      );
    } catch {
      throw new AppException(
        "CURRICULUM_OVERVIEW_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }
    // The role set, not the primary role: a Manager granted TEAM_LEAD holds
    // `role = MANAGER` and was refused the curriculum overview.
    if (!actor.roles.includes("TEAM_LEAD")) {
      throw new AppException(
        "CURRICULUM_OVERVIEW_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }

    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { timeZone: true },
    });

    return {
      userId: actor.userId,
      academyId,
      timeZone: academy?.timeZone ?? ACADEMY_TIME_ZONE,
    };
  }
}
