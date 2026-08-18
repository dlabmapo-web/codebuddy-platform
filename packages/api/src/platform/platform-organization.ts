import type { Prisma } from "../generated/prisma/client.js";

/**
 * The one organization every academy is created inside.
 *
 * Resolved by configured slug and created on first use rather than seeded, so
 * a fresh deployment can onboard its first customer without a migration step
 * somebody has to remember.
 *
 * One organization for the whole platform, not one per academy. An academy's
 * slug is unique within its organization, so a single organization makes the
 * slug effectively global — which is what an operator assumes when they type
 * one — and a franchise that later wants several branches grouped is then a
 * re-point of `organizationId` rather than a merge of throwaway rows.
 */
export async function resolvePlatformOrganization(
  transaction: Prisma.TransactionClient,
  slug: string,
): Promise<{ id: string; created: boolean }> {
  const existing = await transaction.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await transaction.organization.create({
    data: { name: organizationNameFromSlug(slug), slug },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/** Title-cased from the slug — a placeholder nobody reads until orgs surface. */
export function organizationNameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
