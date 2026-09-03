import { HttpStatus, Injectable } from "@nestjs/common";
import {
  canCombineAcademyRoles,
  displayableEmail,
  effectiveAcademyRoles,
  primaryAcademyRole,
  type AcademyRole,
} from "@cove/shared";

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
    select: {
      id: true,
      email: true,
      emailIsPlaceholder: true,
      displayName: true,
    },
  },
  extraRoles: { select: { role: true } },
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

  /**
   * Adds a role beside the ones this member already holds.
   *
   * The primary role on the membership row is left alone unless the new role
   * outranks it, in which case the two swap: `AcademyMembership.role` must
   * stay the highest held role, because every existing roster, index, and
   * analytic reads it as exactly that.
   */
  async grantRole(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string; role: AcademyRole },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    return this.prisma.$transaction(async (transaction) => {
      const membership = await this.lockMembership(
        transaction,
        input.academyId,
        input.membershipId,
      );
      if (membership.status !== "ACTIVE") {
        throw new AppException("MEMBERSHIP_STATE_CONFLICT", HttpStatus.CONFLICT);
      }

      const held = effectiveAcademyRoles(
        membership.role,
        membership.extraRoles.map((extra) => extra.role),
      );
      const { next, primary } = planRoleGrant(held, input.role);
      // The role being displaced from the primary slot becomes an extra row,
      // and the new highest takes its place. Written as a delete-then-create
      // of the whole extra set rather than a diff: there are at most three
      // rows, and a diff here would be more code than it saves.
      await transaction.academyMembershipRole.deleteMany({
        where: { membershipId: membership.id },
      });
      await transaction.academyMembershipRole.createMany({
        data: next
          .filter((role) => role !== primary)
          .map((role) => ({
            membershipId: membership.id,
            role,
            grantedByUserId: actor.userId,
          })),
      });
      const updated = await transaction.academyMembership.update({
        where: { id: membership.id },
        data: { role: primary, approvedByUserId: actor.userId },
        include: membershipInclude,
      });

      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.membership.role_granted",
        targetType: "AcademyMembership",
        targetId: membership.id,
        before: { roles: held },
        after: { roles: next },
      });
      await bumpPeopleRevision(transaction, input.academyId);
      return toAcademyMember(updated);
    });
  }

  /**
   * Takes one role away from a member who holds several.
   *
   * Removing the last one is refused: a membership that grants nothing is not
   * a membership, and the action the caller actually wants is removing the
   * member, which is a different button with different consequences.
   */
  async revokeRole(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string; role: AcademyRole },
  ) {
    const actor = await this.requireManager(identity, input.academyId);
    const { member, changed } = await this.prisma.$transaction(
      async (transaction) => {
        const membership = await this.lockMembership(
          transaction,
          input.academyId,
          input.membershipId,
        );
        const held = effectiveAcademyRoles(
          membership.role,
          membership.extraRoles.map((extra) => extra.role),
        );
        const { next, primary } = planRoleRevoke(held, input.role);
        // The same guard `changeRole` applies: an academy must not be left
        // without a manager because somebody removed the only one's manager
        // role while leaving their teacher role in place.
        if (input.role === "MANAGER") {
          await this.requireAnotherActiveManager(
            transaction,
            input.academyId,
            membership.id,
          );
        }

        await transaction.academyMembershipRole.deleteMany({
          where: { membershipId: membership.id },
        });
        await transaction.academyMembershipRole.createMany({
          data: next
            .filter((role) => role !== primary)
            .map((role) => ({
              membershipId: membership.id,
              role,
              grantedByUserId: actor.userId,
            })),
        });
        const updated = await transaction.academyMembership.update({
          where: { id: membership.id },
          data: { role: primary, approvedByUserId: actor.userId },
          include: membershipInclude,
        });

        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "academy.membership.role_revoked",
          targetType: "AcademyMembership",
          targetId: membership.id,
          before: { roles: held },
          after: { roles: next },
        });
        await bumpPeopleRevision(transaction, input.academyId);
        return {
          member: toAcademyMember(updated),
          // Losing a role narrows what this person may do, so any live
          // monitoring stream they hold on the strength of it has to end —
          // the same reason `changeRole` revokes.
          changed: true,
        };
      },
    );
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

/**
 * What a membership's roles become when one is added, or why they cannot.
 *
 * Pure, and exported for the same reason `hasAnotherActiveManager` is: the
 * decision here is arithmetic over a role set, and testing it through a
 * transaction would test the mock rather than the rule.
 */
export function planRoleGrant(
  held: readonly AcademyRole[],
  granted: AcademyRole,
): { next: readonly AcademyRole[]; primary: AcademyRole } {
  if (held.includes(granted)) {
    throw new AppException("MEMBERSHIP_ROLE_ALREADY_HELD", HttpStatus.CONFLICT);
  }
  const next = effectiveAcademyRoles(granted, held);
  // Refuses both directions at once: STUDENT onto staff, and staff onto a
  // student. A membership id names one subject, and every points, monitoring,
  // and analytics query depends on that staying true.
  if (!canCombineAcademyRoles(next)) {
    throw new AppException("MEMBERSHIP_ROLE_CONFLICT", HttpStatus.CONFLICT);
  }
  return { next, primary: primaryAcademyRole(next)! };
}

/**
 * The same for a removal.
 *
 * Removing the last role is refused rather than allowed to empty the set: a
 * membership that grants nothing is not a membership, and the action the
 * caller actually wants is removing the member — a different button with
 * different consequences.
 */
export function planRoleRevoke(
  held: readonly AcademyRole[],
  revoked: AcademyRole,
): { next: readonly AcademyRole[]; primary: AcademyRole } {
  if (!held.includes(revoked)) {
    throw new AppException("MEMBERSHIP_ROLE_NOT_HELD", HttpStatus.CONFLICT);
  }
  if (held.length === 1) {
    throw new AppException("MEMBERSHIP_ROLE_LAST", HttpStatus.CONFLICT);
  }
  const next = held.filter((role) => role !== revoked);
  return { next, primary: primaryAcademyRole(next)! };
}

export function toAcademyMember(membership: {
  id: string;
  role: AcademyRole;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "LEFT";
  joinedAt: Date | null;
  suspendedAt: Date | null;
  user: {
    id: string;
    email: string | null;
    emailIsPlaceholder?: boolean;
    displayName: string | null;
  };
  extraRoles?: { role: AcademyRole }[];
}) {
  return {
    id: membership.id,
    user: {
      id: membership.user.id,
      // A student's generated address is not an address anybody can read, and
      // the roster is one of the places it would otherwise be rendered as
      // though it were.
      email: membership.user.emailIsPlaceholder
        ? null
        : displayableEmail(membership.user.email),
      displayName: membership.user.displayName,
    },
    role: membership.role,
    roles: [
      ...effectiveAcademyRoles(
        membership.role,
        (membership.extraRoles ?? []).map((extra) => extra.role),
      ),
    ],
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    suspendedAt: membership.suspendedAt?.toISOString() ?? null,
  };
}
