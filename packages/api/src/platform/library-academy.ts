import type { Prisma } from "../generated/prisma/client.js";
import { resolvePlatformOrganization } from "./platform-organization.js";

/**
 * Every listing that means "the platform's customers" filters on this.
 *
 * One exported fragment rather than seven hand-written `kind: "ACADEMY"`
 * clauses: a library missed in one console list is head office's own
 * curriculum appearing as a customer academy in the middle of a support call,
 * and the seventh copy of a filter is where that happens.
 */
export const tenantAcademies = { kind: "ACADEMY" } as const satisfies
  Pick<Prisma.AcademyWhereInput, "kind">;

/** The slug the content library answers to inside its organization. */
export const CONTENT_LIBRARY_SLUG = "content-library";

/**
 * The organization's one content library, created on first use.
 *
 * Resolved rather than seeded, mirroring `resolvePlatformOrganization` exactly:
 * a fresh deployment publishes its first master course without an ops step
 * somebody has to remember, and the second call finds what the first made.
 *
 * The uniqueness that matters is not this slug but the partial index
 * `academies_one_library_per_organization`, which is what makes "the library"
 * an unambiguous phrase. Two callers racing here both land on it, and the
 * loser's insert fails rather than producing a second library.
 */
export async function resolveContentLibrary(
  transaction: Prisma.TransactionClient,
  organizationSlug: string,
): Promise<{ id: string; organizationId: string; created: boolean }> {
  const organization = await resolvePlatformOrganization(
    transaction,
    organizationSlug,
  );

  const existing = await transaction.academy.findFirst({
    where: { organizationId: organization.id, kind: "LIBRARY" },
    select: { id: true },
  });
  if (existing) {
    return {
      id: existing.id,
      organizationId: organization.id,
      created: false,
    };
  }

  const created = await transaction.academy.create({
    data: {
      organizationId: organization.id,
      kind: "LIBRARY",
      name: "Content Library",
      slug: CONTENT_LIBRARY_SLUG,
      // A library has no local day to bucket anything by — it has no students
      // and no attendance — so this is the column's default rather than a
      // claim about where head office sits.
      timeZone: "Asia/Seoul",
    },
    select: { id: true },
  });
  return { id: created.id, organizationId: organization.id, created: true };
}
