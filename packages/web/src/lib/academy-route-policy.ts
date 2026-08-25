import type { AuthMeResponse } from '@cove/shared';

export type AcademyRouteIdentity = {
  academyId: string;
  academySlug: string;
};

export function academyIdentityFromAccount(
  account: AuthMeResponse,
  academySlug: string,
): AcademyRouteIdentity | null {
  const membership = account.user.memberships.find(
    (candidate) =>
      candidate.status === 'ACTIVE' && candidate.academy.slug === academySlug,
  );
  return membership
    ? { academyId: membership.academy.id, academySlug: membership.academy.slug }
    : null;
}
