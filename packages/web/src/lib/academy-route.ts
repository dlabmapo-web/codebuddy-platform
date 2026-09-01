import type { PlatformViewRole } from '@cove/shared';
import { isPlatformViewRole } from '@cove/shared';
import { cookies } from 'next/headers';
import { notFound, redirect, RedirectType } from 'next/navigation';
import { cache } from 'react';

import {
  createPlatformServerORPCClient,
  createServerORPCClient,
  getAccount,
} from '@/lib/orpc-server';
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
/**
 * Which academy role a platform operator is standing in.
 *
 * The cookie the console sets when they press Enter academy, and the same value
 * `orpc-server` forwards to the API — so the sidebar the web builds and the
 * permissions the API grants come from one source. Defaults to `MANAGER`, the
 * widest of the three.
 */
export const platformViewRole = cache(async (): Promise<PlatformViewRole> => {
  const value = (await cookies()).get('cove_view_role')?.value;
  return isPlatformViewRole(value) ? value : 'MANAGER';
});

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
    if (grant) {
      return {
        academyId: grant.academyId,
        academySlug: grant.academySlug,
        // The role the grant assumes. Every surface below branches on this
        // exactly as it does for a member, which is the whole point of the
        // grant carrying one.
        role: grant.assumedRole,
      };
    }

    // A platform operator reads any academy without a session. The API says
    // the same — `AcademyAccessService` answers `via: "platform"` for reads —
    // and this resolves the route the same way so the two cannot disagree
    // about whether the page exists.
    const inspected = await inspectAcademyRoute(academySlug);
    if (!inspected) return null;
    return {
      academyId: inspected.academyId,
      academySlug: inspected.academySlug,
      // The role the operator chose to stand in, read from the same cookie the
      // API is told about. Hardcoding `MANAGER` here meant the sidebar was
      // built for a Manager whatever the operator picked, while the API
      // answered for the role they actually chose.
      role: await platformViewRole(),
    };
  },
);

/**
 * The academy an operator is looking at, resolved through their own seam.
 *
 * `platformAcademies.resolveSlug` answers for any signed-in caller, so it
 * cannot be used to decide this. `platformAcademies.getBySlug` is gated on
 * `platform.academies.read`, which is exactly the question being asked.
 */
export const inspectAcademyRoute = cache(
  async (academySlug: string) => {
    try {
      const academy =
        await createPlatformServerORPCClient().platformAcademies.getBySlug({
          academySlug,
        });
      return {
        academyId: academy.id,
        academySlug: academy.slug,
        academyName: academy.name,
      };
    } catch {
      return null;
    }
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

/**
 * Platform operators resolve through their separately authorized API seam.
 *
 * This seam serves every console-owned academy route, including course and
 * class administration. The reported Manager role is not a membership: it is
 * the platform view's permission set, whose Manager superset is what the API
 * applies when no explicit view header is sent. This route deliberately never
 * reads `cove_view_role`.
 */
export const resolvePlatformAcademyRoute = cache(
  async (academySlug: string): Promise<AcademyRouteIdentity | null> => {
    try {
      const academy =
        await createPlatformServerORPCClient().platformAcademies.getBySlug({
          academySlug,
        });
      return {
        academyId: academy.id,
        academySlug: academy.slug,
        role: 'MANAGER' as const,
      };
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
