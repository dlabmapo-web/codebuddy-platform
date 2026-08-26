import type { AcademyRole, AuthMeResponse } from '@cove/shared';

export type AcademyRouteIdentity = {
  academyId: string;
  academySlug: string;
  /** The actor's role in this academy. Routes that differ for staff and
   *  students branch on this rather than re-reading the membership. */
  role: AcademyRole;
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
    ? {
        academyId: membership.academy.id,
        academySlug: membership.academy.slug,
        role: membership.role,
      }
    : null;
}
