import {
  deriveAcademyManagerState,
  type PlatformAcademyDetail,
  type PlatformAcademySummary,
} from "@cove/shared";

import type { AcademyRole, MembershipStatus } from "../generated/prisma/enums.js";
import type { AcademyStats } from "./academy-stats.js";

/**
 * The rows the platform surface reads, and how they become a summary.
 *
 * A mapper rather than a `select` shaped like the response: the manager state
 * and the member counts are both derived from the same membership rows, and
 * deriving them in one place is what keeps the list and the detail page from
 * ever disagreeing about whether an academy has a manager.
 */
export type AcademyRecord = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  timeZone: string;
  createdAt: Date;
  statusChangedAt: Date | null;
  memberships: { role: AcademyRole; status: MembershipStatus }[];
  invitations: {
    email: string;
    expiresAt: Date;
    role: AcademyRole;
    status: string;
  }[];
};

export function toAcademySummary(
  record: AcademyRecord,
  now: Date = new Date(),
): PlatformAcademySummary {
  const active = record.memberships.filter(
    (membership) => membership.status === "ACTIVE",
  );
  const managerState = deriveAcademyManagerState({
    activeManagers: active.filter((m) => m.role === "MANAGER").length,
    // Any status, so an academy whose only manager left reads differently
    // from one that has never had a manager at all.
    everManagers: record.memberships.filter((m) => m.role === "MANAGER").length,
  });

  const pending = record.invitations.find(
    (invitation) =>
      invitation.role === "MANAGER" && invitation.status === "PENDING",
  );

  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    timeZone: record.timeZone,
    managerState,
    memberCounts: {
      total: active.length,
      managers: active.filter((m) => m.role === "MANAGER").length,
      teamLeads: active.filter((m) => m.role === "TEAM_LEAD").length,
      teachers: active.filter((m) => m.role === "TEACHER").length,
      students: active.filter((m) => m.role === "STUDENT").length,
    },
    pendingManagerInvitation: pending
      ? {
          email: pending.email,
          expiresAt: pending.expiresAt.toISOString(),
          // Reported rather than corrected here. A sweep marks it EXPIRED, but
          // an operator looking at a stalled academy needs to see it whether or
          // not the sweep has run yet.
          isExpired: pending.expiresAt <= now,
        }
      : null,
    createdAt: record.createdAt.toISOString(),
    statusChangedAt: record.statusChangedAt?.toISOString() ?? null,
  };
}

export type AcademyDetailRecord = AcademyRecord & {
  organization: { id: string; name: string; slug: string };
  contactEmail: string | null;
  contactPhone: string | null;
  locality: string | null;
  countryCode: string | null;
  profileUpdatedAt: Date | null;
  createdBy: { id: string; email: string | null; displayName: string | null } | null;
};

export function toAcademyDetail(
  record: AcademyDetailRecord,
  stats: AcademyStats,
  now: Date = new Date(),
): PlatformAcademyDetail {
  return {
    ...toAcademySummary(record, now),
    ...stats,
    organization: record.organization,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    locality: record.locality,
    countryCode: record.countryCode,
    profileUpdatedAt: record.profileUpdatedAt?.toISOString() ?? null,
    createdBy: record.createdBy,
  };
}
