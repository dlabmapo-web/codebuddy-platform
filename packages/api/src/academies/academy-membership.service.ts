import { HttpStatus, Injectable } from "@nestjs/common";
import type { AcademyRole } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import {
  applyMembershipRoleChange,
  assertAnotherActiveManager,
  hasAnotherActiveManager,
  lockMembershipForUpdate,
  membershipInclude,
  toAcademyMember,
} from "./academy-membership.operations.js";
import { AuditService } from "./audit.service.js";

export { hasAnotherActiveManager, toAcademyMember };

@Injectable()
export class AcademyMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    /**
     * Suspending a member or moving them off a role revokes live monitoring
     * on both sides of it, published after the transaction commits.
     */
    private readonly revocation: MonitoringRevocationService,
  ) {}

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.members.manage",
    );
    const members = await this.prisma.academyMembership.findMany({
      where: { academyId },
      include: membershipInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { members: members.map(toAcademyMember) };
  }

  /**
   * A manager's own role change on their own academy.
   *
   * The invariants live in `applyMembershipRoleChange` (§3.8 of the console
   * people operations design) — the same function the platform console's
   * `PlatformUsersService.setMembershipRole` calls after its own
   * authorization check. This method contributes only `requireManager` and
   * the follow-up read that shapes the response the members table expects.
   */
  async changeRole(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string; role: AcademyRole },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    const { changed } = await this.prisma.$transaction((transaction) =>
      applyMembershipRoleChange(transaction, this.audit, {
        academyId: input.academyId,
        membershipId: input.membershipId,
        role: input.role,
        actorUserId: actor.userId,
      }),
    );
    if (changed) {
      await this.revocation.revokeMembership(input.membershipId, "ROLE_CHANGED");
    }
    const updated = await this.prisma.academyMembership.findUniqueOrThrow({
      where: { id: input.membershipId },
      include: membershipInclude,
    });
    return toAcademyMember(updated);
  }

  async suspend(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    const suspended = await this.prisma.$transaction(async (transaction) => {
      const membership = await lockMembershipForUpdate(
        transaction,
        input.academyId,
        input.membershipId,
      );
      if (membership.status !== "ACTIVE") {
        throw new AppException(
          "MEMBERSHIP_STATE_CONFLICT",
          HttpStatus.CONFLICT,
        );
      }
      if (membership.role === "MANAGER") {
        await assertAnotherActiveManager(
          transaction,
          input.academyId,
          membership.id,
        );
      }
      const updated = await transaction.academyMembership.update({
        where: { id: membership.id },
        data: { status: "SUSPENDED", suspendedAt: new Date() },
        include: membershipInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.membership.suspended",
        targetType: "AcademyMembership",
        targetId: membership.id,
        before: { role: membership.role, status: membership.status },
        after: { role: updated.role, status: updated.status },
      });

      // §8.1 — every membership change moves the academy's people
      // revision, inside the same transaction, so a bulk selection or an import
      // preview built before this cannot silently commit over it.
      await bumpPeopleRevision(transaction, input.academyId);
      return toAcademyMember(updated);
    });
    await this.revocation.revokeMembership(
      input.membershipId,
      "MEMBERSHIP_INACTIVE",
    );
    return suspended;
  }

  async restore(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    return this.prisma.$transaction(async (transaction) => {
      const membership = await lockMembershipForUpdate(
        transaction,
        input.academyId,
        input.membershipId,
      );
      if (membership.status !== "SUSPENDED") {
        throw new AppException(
          "MEMBERSHIP_STATE_CONFLICT",
          HttpStatus.CONFLICT,
        );
      }
      const updated = await transaction.academyMembership.update({
        where: { id: membership.id },
        data: { status: "ACTIVE", suspendedAt: null },
        include: membershipInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.membership.restored",
        targetType: "AcademyMembership",
        targetId: membership.id,
        before: { role: membership.role, status: membership.status },
        after: { role: updated.role, status: updated.status },
      });

      // §8.1 — every membership change moves the academy's people
      // revision, inside the same transaction, so a bulk selection or an import
      // preview built before this cannot silently commit over it.
      await bumpPeopleRevision(transaction, input.academyId);
      return toAcademyMember(updated);
    });
  }

  private requireManager(identity: SupabaseIdentity, academyId: string) {
    return this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.members.manage",
    );
  }
}
