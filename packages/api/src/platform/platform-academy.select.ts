import type { Prisma } from "../generated/prisma/client.js";

/**
 * What the platform surface reads about an academy.
 *
 * Shared by the list, the detail page, and the lifecycle service so all three
 * derive the manager state from the same rows. Nothing here reaches inside the
 * academy: no course, class, submission, or member profile is selected,
 * because platform authority is about an academy and never within one.
 */
export const academySummarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  timeZone: true,
  createdAt: true,
  statusChangedAt: true,
  memberships: { select: { role: true, status: true } },
  invitations: {
    where: { role: "MANAGER" as const },
    select: { email: true, expiresAt: true, role: true, status: true },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.AcademySelect;

export const academyDetailSelect = {
  ...academySummarySelect,
  contactEmail: true,
  contactPhone: true,
  locality: true,
  countryCode: true,
  profileUpdatedAt: true,
  organization: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, email: true, displayName: true } },
} satisfies Prisma.AcademySelect;
