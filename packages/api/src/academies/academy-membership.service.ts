import { HttpStatus, Injectable } from "@nestjs/common";
import type { AcademyRole } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import { AuditService } from "./audit.service.js";

const membershipInclude = {
  user: {
    select: { id: true, email: true, displayName: true },
  },
} as const;

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

  async changeRole(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string; role: AcademyRole },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    const { member, changed } = await this.prisma.$transaction(async (transaction) => {
      const membership = await this.lockMembership(
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
      if (membership.role === "MANAGER" && input.role !== "MANAGER") {
        await this.requireAnotherActiveManager(
          transaction,
          input.academyId,
          membership.id,
        );
      }
      if (membership.role === input.role) {
        return { member: toAcademyMember(membership), changed: false };
      }

      const updated = await transaction.academyMembership.update({
        where: { id: membership.id },
        data: { role: input.role, approvedByUserId: actor.userId },
        include: membershipInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.membership.role_changed",
        targetType: "AcademyMembership",
        targetId: membership.id,
        before: { role: membership.role, status: membership.status },
        after: { role: updated.role, status: updated.status },
      });
      // §8.1 — every membership change moves the academy's people revision,
      // inside the same transaction, so a bulk selection or an import preview
      // built before this cannot silently commit over it.
      await bumpPeopleRevision(transaction, input.academyId);
      return { member: toAcademyMember(updated), changed: true };
    });
    if (changed) {
      await this.revocation.revokeMembership(input.membershipId, "ROLE_CHANGED");
    }
    return member;
  }

  async suspend(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    const suspended = await this.prisma.$transaction(async (transaction) => {
      const membership = await this.lockMembership(
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
        await this.requireAnotherActiveManager(
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
      const membership = await this.lockMembership(
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

  private async lockMembership(
    transaction: Prisma.TransactionClient,
    academyId: string,
    membershipId: string,
  ) {
    await transaction.$queryRaw`
      SELECT id
      FROM academy_memberships
      WHERE id = ${membershipId}::uuid
        AND academy_id = ${academyId}::uuid
      FOR UPDATE
    `;
    const membership = await transaction.academyMembership.findFirst({
      where: { id: membershipId, academyId },
      include: membershipInclude,
    });
    if (!membership) {
      throw new AppException(
        "ACADEMY_MEMBERSHIP_REQUIRED",
        HttpStatus.NOT_FOUND,
      );
    }
    return membership;
  }

  private async requireAnotherActiveManager(
    transaction: Prisma.TransactionClient,
    academyId: string,
    targetMembershipId: string,
  ): Promise<void> {
    const managers = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM academy_memberships
      WHERE academy_id = ${academyId}::uuid
        AND role = 'MANAGER'
        AND status = 'ACTIVE'
      ORDER BY id
      FOR UPDATE
    `;
    if (!hasAnotherActiveManager(managers, targetMembershipId)) {
      throw new AppException("LAST_MANAGER_REQUIRED", HttpStatus.CONFLICT);
    }
  }
}

export function hasAnotherActiveManager(
  managers: readonly { id: string }[],
  targetMembershipId: string,
): boolean {
  return managers.some((manager) => manager.id !== targetMembershipId);
}

export function toAcademyMember(membership: {
  id: string;
  role: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER";
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "LEFT";
  joinedAt: Date | null;
  suspendedAt: Date | null;
  user: { id: string; email: string | null; displayName: string | null };
}) {
  return {
    id: membership.id,
    user: membership.user,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    suspendedAt: membership.suspendedAt?.toISOString() ?? null,
  };
}
