import { notFound } from 'next/navigation';
import { cache } from 'react';

import { createServerORPCClient } from '@/lib/orpc-server';
import {
  academyIdentityFromAccount,
  type AcademyRouteIdentity,
} from '@/lib/academy-route-policy';

export type { AcademyRouteIdentity } from '@/lib/academy-route-policy';

export const resolveAcademyRoute = cache(
  async (academySlug: string): Promise<AcademyRouteIdentity | null> => {
    try {
      const account = await createServerORPCClient().auth.me({});
      return academyIdentityFromAccount(account, academySlug);
    } catch {
      return null;
    }
  },
);

export async function requireAcademyRoute(
  academySlug: string,
): Promise<AcademyRouteIdentity> {
  const identity = await resolveAcademyRoute(academySlug);
  if (!identity) notFound();
  return identity;
}

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
