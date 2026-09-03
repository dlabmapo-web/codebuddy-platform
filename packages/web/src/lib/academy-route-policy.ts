import type { AcademyRole, AuthMeResponse } from '@cove/shared';

export type AcademyRouteIdentity = {
  academyId: string;
  academySlug: string;
  /** The actor's highest role in this academy. Routes that are *about* one
   *  role — which overview to render — branch on this. */
  role: AcademyRole;
  /**
   * Every role the actor holds here.
   *
   * What the `can*` gates take, because a Manager who also teaches holds both
   * sets and asking only about the highest would hide the teaching surfaces
   * that are the reason for the second role. Carried on the identity so a page
   * gets it from the same read that already resolved the academy.
   */
  roles: readonly AcademyRole[];
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
        roles: membership.roles,
      }
    : null;
}
