import type { AuthMeResponse } from '@cove/shared';

import { routes } from '@/lib/routes';

const canonicalAcademyFamilies = new Set([
  'classes',
  'content',
  'learn',
  'teach',
  'people',
  'applications',
  'invitations',
  'points',
]);

/** Resolve a retired academy UUID only through memberships visible to the user. */
export function legacyAcademySlug(
  account: AuthMeResponse,
  academyId: string,
): string | null {
  return account.user.memberships.find(
    (membership) =>
      membership.status === 'ACTIVE' && membership.academy.id === academyId,
  )?.academy.slug ?? null;
}

/**
 * Translate the safe portion of a retired academy URL to its canonical root.
 * Next has already decoded dynamic segments, so each segment is encoded again
 * rather than treating the suffix as one caller-controlled URL.
 */
export function legacyAcademyDestination(
  academySlug: string,
  legacyPath: string[] | undefined,
): string {
  const academyRoot = routes.academy(academySlug);
  if (
    !legacyPath?.length
    || !canonicalAcademyFamilies.has(legacyPath[0] ?? '')
  ) {
    return academyRoot;
  }

  return `${academyRoot}/${legacyPath.map(encodeURIComponent).join('/')}`;
}
