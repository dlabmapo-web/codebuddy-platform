import { HttpStatus } from "@nestjs/common";
import {
  displayableEmail,
  effectiveAcademyRoles,
  type AcademyRole,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import type { AuditService } from "./audit.service.js";

export const membershipInclude = {
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

type MembershipWithUser = Prisma.AcademyMembershipGetPayload<{
  include: typeof membershipInclude;
}>;

/**
 * One place that knows the four invariants of an academy membership's role.
 *
 * §3.8 of the console people operations design: two callers reach a role
 * change — a manager acting on their own academy, and a platform operator
 * acting from the console — and they must not restate the rules that make it
 * safe. Both call this after their own authorization check; this function
 * knows nothing about who asked.
 *
 * The four invariants, all inside one transaction:
 *
 * - the membership must be `ACTIVE` (`MEMBERSHIP_STATE_CONFLICT` otherwise);
 * - a departing manager must not be the academy's last active one
 *   (`LAST_MANAGER_REQUIRED`);
 * - the change bumps the academy's people revision, so a stale bulk selection
 *   or import preview cannot commit over it (§8.1);
 * - the caller revokes the member's live-monitoring sessions afterwards, once
 *   `changed` is true — deliberately left to the caller, since that happens
 *   after the transaction commits.
 *
 * If this spec results in two places that know the last-manager rule, it has
 * failed.
 */
export async function applyMembershipRoleChange(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  input: {
    academyId: string;
    membershipId: string;
    role: AcademyRole;
    actorUserId: string;
    /** Platform-side callers state one; a manager's own change needs none. */
    reason?: string;
  },
): Promise<{ membershipId: string; changed: boolean }> {
  const membership = await lockMembershipForUpdate(
    tx,
    input.academyId,
    input.membershipId,
  );
  if (membership.status !== "ACTIVE") {
    throw new AppException("MEMBERSHIP_STATE_CONFLICT", HttpStatus.CONFLICT);
  }
  if (membership.role === "MANAGER" && input.role !== "MANAGER") {
    await assertAnotherActiveManager(tx, input.academyId, membership.id);
  }
  if (membership.role === input.role) {
    return { membershipId: membership.id, changed: false };
  }

  const updated = await tx.academyMembership.update({
    where: { id: membership.id },
    data: { role: input.role, approvedByUserId: input.actorUserId },
    include: membershipInclude,
  });
  await audit.write(tx, {
    actorUserId: input.actorUserId,
    academyId: input.academyId,
    action: "academy.membership.role_changed",
    targetType: "AcademyMembership",
    targetId: membership.id,
    before: { role: membership.role, status: membership.status },
    after: { role: updated.role, status: updated.status },
    reason: input.reason,
  });
  // §8.1 — every membership change moves the academy's people revision,
  // inside the same transaction, so a bulk selection or an import preview
  // built before this cannot silently commit over it.
  await bumpPeopleRevision(tx, input.academyId);

  return { membershipId: updated.id, changed: true };
}

export async function lockMembershipForUpdate(
  tx: Prisma.TransactionClient,
  academyId: string,
  membershipId: string,
): Promise<MembershipWithUser> {
  await tx.$queryRaw`
    SELECT id
    FROM academy_memberships
    WHERE id = ${membershipId}::uuid
      AND academy_id = ${academyId}::uuid
    FOR UPDATE
  `;
  const membership = await tx.academyMembership.findFirst({
    where: { id: membershipId, academyId },
    include: membershipInclude,
  });
  if (!membership) {
    throw new AppException("ACADEMY_MEMBERSHIP_REQUIRED", HttpStatus.NOT_FOUND);
  }
  return membership;
}

export async function assertAnotherActiveManager(
  tx: Prisma.TransactionClient,
  academyId: string,
  targetMembershipId: string,
): Promise<void> {
  const managers = await tx.$queryRaw<Array<{ id: string }>>`
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

export function hasAnotherActiveManager(
  managers: readonly { id: string }[],
  targetMembershipId: string,
): boolean {
  return managers.some((manager) => manager.id !== targetMembershipId);
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
