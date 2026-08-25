import type { ProfileMembership } from '@cove/shared';

import { routes } from '@/lib/routes';

/**
 * Which academy My Page is showing.
 *
 * Design §6.1: the `academy` query value must name one of the caller's active
 * memberships. Anything else — an academy they left, one they were never in,
 * a typo — is not an error page. It is removed with replace navigation and the
 * page falls back, because a stale bookmark is the most likely way to get here
 * and losing the whole page over it would be absurd.
 */
export type AcademySelection = {
  /** The membership to expand, or null when the account has no active one. */
  selected: ProfileMembership | null;
  /** Every academy the switcher may offer. */
  options: ProfileMembership[];
  /** True when the query named something the caller may not select. */
  shouldReplaceUrl: boolean;
};

export function selectAcademy(
  memberships: ProfileMembership[],
  requested: string | null,
  remembered?: string | null,
): AcademySelection {
  const options = memberships.filter(
    (membership) => membership.status === 'ACTIVE',
  );
  if (options.length === 0) {
    // A signed-in person with no active membership still has an account,
    // preferences, and security. They are not turned away.
    return { selected: null, options, shouldReplaceUrl: Boolean(requested) };
  }

  const named = requested
    ? options.find((option) => option.academyId === requested)
    : undefined;
  if (named) return { selected: named, options, shouldReplaceUrl: false };

  const previous = remembered
    ? options.find((option) => option.academyId === remembered)
    : undefined;

  return {
    selected: previous ?? options[0]!,
    options,
    // Only when the URL made a claim the account cannot honour. Arriving with
    // no query at all is the normal case and rewrites nothing.
    shouldReplaceUrl: Boolean(requested),
  };
}

/** The canonical path for one academy's My Page. */
export function myPagePath(academyId: string | null): string {
  return routes.withQuery(routes.account, { academy: academyId });
}

/** Where the browser remembers the last academy the reader looked at. */
export const lastAcademyStorageKey = 'cove_my_page_academy';
