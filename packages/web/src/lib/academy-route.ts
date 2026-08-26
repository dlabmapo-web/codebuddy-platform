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
            // A platform operator holds no academy membership. They reach an
            // academy through the platform seam with full oversight, so for
            // route decisions they behave as a manager: never the student
            // delivery view, always the management view.
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
