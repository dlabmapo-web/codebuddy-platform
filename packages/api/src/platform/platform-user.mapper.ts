import type {
  AcademyRole,
  InvitationDeliveryState,
  InvitationStatus,
  PlatformUserDetail,
  PlatformUserInvitation,
  PlatformUserMembership,
  PlatformUserSummary,
} from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";

/**
 * What the directory reads, and the only shape it may read.
 *
 * A `select` rather than an `include`, for the reason the whole console rests
 * on: `include` grows silently. The day somebody adds a guardian phone number
 * to `StudentAcademyProfile`, an `include` would start returning it to the
 * platform and nobody would see the diff. This list is the boundary, written
 * out, and adding a field to it is a visible decision.
 */
export const userSummarySelect = {
  id: true,
  displayName: true,
  username: true,
  email: true,
  avatarUrl: true,
  status: true,
  platformRole: true,
  createdAt: true,
  memberships: {
    select: {
      id: true,
      role: true,
      status: true,
      joinedAt: true,
      academy: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ academy: { name: "asc" } }, { id: "asc" }],
  },
} as const satisfies Prisma.UserSelect;

export const userDetailSelect = {
  ...userSummarySelect,
  lastSignInAt: true,
  joinRequests: {
    select: {
      id: true,
      status: true,
      approvedRole: true,
      createdAt: true,
      reviewedAt: true,
      academy: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} as const satisfies Prisma.UserSelect;

type UserSummaryRecord = Prisma.UserGetPayload<{
  select: typeof userSummarySelect;
}>;
type UserDetailRecord = Prisma.UserGetPayload<{
  select: typeof userDetailSelect;
}>;

export function toUserSummary(
  record: UserSummaryRecord,
): PlatformUserSummary {
  return {
    userId: record.id,
    displayName: record.displayName,
    username: record.username,
    email: record.email,
    avatarUrl: record.avatarUrl,
    status: record.status,
    platformRole: record.platformRole,
    createdAt: record.createdAt.toISOString(),
    memberships: record.memberships.map(toUserMembership),
  };
}

/**
 * The detail, minus its invitations.
 *
 * Invitations are keyed on an email address rather than on a user id — an
 * invitation exists before the account that accepts it — so they cannot be
 * selected through this relation and are attached by the service.
 */
export function toUserDetail(
  record: UserDetailRecord,
  invitations: PlatformUserDetail["invitations"] = [],
): PlatformUserDetail {
  return {
    ...toUserSummary(record),
    lastSignInAt: record.lastSignInAt?.toISOString() ?? null,
    invitations,
    joinRequests: record.joinRequests.map((request) => ({
      id: request.id,
      academyId: request.academy.id,
      academyName: request.academy.name,
      academySlug: request.academy.slug,
      approvedRole: request.approvedRole,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
    })),
  };
}

function toUserMembership(record: {
  id: string;
  role: PlatformUserMembership["role"];
  status: PlatformUserMembership["status"];
  joinedAt: Date | null;
  academy: { id: string; name: string; slug: string };
}): PlatformUserMembership {
  return {
    membershipId: record.id,
    academyId: record.academy.id,
    academySlug: record.academy.slug,
    academyName: record.academy.name,
    role: record.role,
    status: record.status,
    joinedAt: record.joinedAt?.toISOString() ?? null,
  };
}

/**
 * One invitation sent to this account's address, with how it landed.
 *
 * Only the newest delivery attempt travels. The full history belongs to the
 * academy's own invitation surface, which manages it; the operator's question
 * here is narrower and always the same — did the last send arrive, and if not
 * what did the provider say.
 */
export function toUserInvitation(record: {
  id: string;
  email: string;
  role: AcademyRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  academy: { id: string; name: string; slug: string };
  deliveryAttempts: {
    state: InvitationDeliveryState;
    failureCode: string | null;
    updatedAt: Date;
  }[];
}): PlatformUserInvitation {
  const attempt = record.deliveryAttempts[0];
  return {
    id: record.id,
    academyId: record.academy.id,
    academyName: record.academy.name,
    academySlug: record.academy.slug,
    email: record.email,
    role: record.role,
    status: record.status,
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    lastDelivery: attempt
      ? {
          state: attempt.state,
          failureCode: attempt.failureCode,
          occurredAt: attempt.updatedAt.toISOString(),
        }
      : null,
  };
}
