import { notFound, redirect, RedirectType } from 'next/navigation';
import { cache } from 'react';

import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';
import {
  academyIdentityFromAccount,
  type AcademyRouteIdentity,
} from '@/lib/academy-route-policy';

export type { AcademyRouteIdentity } from '@/lib/academy-route-policy';

/**
 * The caller's live support grant for this academy, or null.
 *
 * Cached per request, because the layout draws its banner from the same answer
 * the guard resolves the route with — one round trip, not two.
 */
export const activeSupportGrant = cache(async (academySlug: string) => {
  try {
    return await createServerORPCClient().platformSupport.active({
      academySlug,
    });
  } catch {
    // A failed lookup is not authority. An outage must leave an operator
    // outside the academy, not inside it without a banner.
    return null;
  }
});

/**
 * Who this person is inside this academy, from either source of authority.
 *
 * Membership first, and a grant only when there is none — the same order
 * `AcademyAccessService` uses on the API, and for the same reason: an operator
 * who is genuinely a member acts as that member, and a forgotten open grant
 * must not silently change what their own pages do.
 *
 * Without this fallback the API would authorize an operator holding a grant
 * and the web route would still answer 404, because `auth.me` reports
 * memberships and a grant is not one.
 */
export const resolveAcademyRoute = cache(
  async (academySlug: string): Promise<AcademyRouteIdentity | null> => {
    try {
      const account = await getAccount();
      const membership = academyIdentityFromAccount(account, academySlug);
      if (membership) return membership;
    } catch {
      return null;
    }

    const grant = await activeSupportGrant(academySlug);
    return grant
      ? {
          academyId: grant.academyId,
          academySlug: grant.academySlug,
          // The role the grant assumes. Every surface below branches on this
          // exactly as it does for a member, which is the whole point of the
          // grant carrying one.
          role: grant.assumedRole,
        }
      : null;
  },
);

export async function requireAcademyRoute(
  academySlug: string,
): Promise<AcademyRouteIdentity> {
  const identity = await resolveAcademyRoute(academySlug);
  if (identity) return identity;

  /*
   * A slug this academy used to answer to. Renaming an academy changes every
   * URL it has ever appeared in — a student's bookmark mid-course, a link a
   * teacher emailed — so a retired slug carries on working rather than
   * becoming a dead end. Only asked once the membership lookup has missed, so
   * the ordinary path costs nothing.
   *
   * A slug no academy ever had still answers 404: a redirect that guesses is
   * worse than a page that admits it does not know.
   */
  const current = await currentSlugFor(academySlug);
  if (current && current !== academySlug) {
    redirect(routes.academy(current), RedirectType.replace);
  }
  notFound();
}

const currentSlugFor = cache(async (academySlug: string) => {
  try {
    const { slug } = await createServerORPCClient().platformAcademies.resolveSlug(
      { slug: academySlug },
    );
    return slug;
  } catch {
    return null;
  }
});

/** Platform operators resolve through their separately authorized API seam. */
export const resolvePlatformAcademyRoute = cache(
  async (academySlug: string): Promise<AcademyRouteIdentity | null> => {
    try {
      const client = createServerORPCClient();
      const result = await client.platformAcademies.list({
        query: academySlug,
        limit: 100,
        offset: 0,
      });
      const academy = result.academies.find((row) => row.slug === academySlug);
      return academy
        ? {
            academyId: academy.id,
            academySlug: academy.slug,
            // A platform operator holds no academy membership, so there is no
            // academy role to report. This seam serves the platform academy
            // page alone, which administers academies and never branches on
            // role; the field only satisfies the shared identity type. The
            // academy surfaces resolve through `resolveAcademyRoute`, which
            // returns null without a membership, so an operator does not
            // reach a course page from here.
            role: 'MANAGER' as const,
          }
        : null;
    } catch {
      return null;
    }
  },
);

export async function requirePlatformAcademyRoute(
  academySlug: string,
): Promise<AcademyRouteIdentity> {
  const identity = await resolvePlatformAcademyRoute(academySlug);
  if (!identity) notFound();
  return identity;
}
