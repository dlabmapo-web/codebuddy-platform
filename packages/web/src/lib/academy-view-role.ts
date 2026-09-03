import type { AcademyRole, AuthMeResponse } from '@cove/shared';

/**
 * Which of a member's roles they are currently working as.
 *
 * Deliberately separate from what they are *allowed* to do. Permissions are
 * the union of every role they hold and are decided by the API, which never
 * reads this; the view role decides only which surface the shell builds. A
 * member who reaches a Manager URL while viewing as a Teacher is served it,
 * because they are a Manager — anything else would make a presentation cookie
 * into a security boundary, which §3 of the authorization design refuses in
 * the same words it refuses frontend route protection.
 *
 * Deliberately NOT named `cove_view_role`. That name belongs to the platform
 * console's own "operator standing in an academy role" mechanism; this is a
 * member choosing between roles they actually hold, which is a different
 * actor answering a different question.
 */
export const viewRoleCookieName = 'cove_academy_role';

/**
 * Stored as `<academyId>:<role>` because the choice is per academy. Being a
 * Manager at Mapo says nothing about which hat somebody wears at Gangnam, and
 * one cookie per academy would leave a trail of them behind.
 */
export function encodeViewRole(academyId: string, role: AcademyRole): string {
  return `${academyId}:${role}`;
}

export function parseViewRole(
  value: string | undefined,
): { academyId: string; role: string } | null {
  if (!value) return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  return {
    academyId: value.slice(0, separator),
    role: value.slice(separator + 1),
  };
}

/**
 * The role to render this academy as, and whether the cookie should be
 * rewritten.
 *
 * A cookie naming a role the member does not hold is not an error page. It is
 * the ordinary consequence of a role being revoked, of switching academies, or
 * of somebody editing the value by hand, and losing the whole screen over any
 * of those would be absurd — the same reasoning `selectAcademy` applies to a
 * stale `?academy=`. It falls back to the primary role, which every member has.
 */
export function resolveViewRole(input: {
  academyId: string;
  held: readonly AcademyRole[];
  primary: AcademyRole;
  cookie: string | undefined;
}): { role: AcademyRole; stale: boolean } {
  const parsed = parseViewRole(input.cookie);
  if (!parsed || parsed.academyId !== input.academyId) {
    // Not stale. A cookie for a different academy is a correct cookie about a
    // different page, and rewriting it here would lose the reader's choice
    // over there.
    return { role: input.primary, stale: false };
  }
  const named = input.held.find((role) => role === parsed.role);
  return named
    ? { role: named, stale: false }
    : { role: input.primary, stale: true };
}

/** Every role this account holds in one academy, or none if it is not a member. */
export function heldRoles(
  account: AuthMeResponse,
  academyId: string,
): readonly AcademyRole[] {
  return (
    account.user.memberships.find(
      (membership) =>
        membership.status === 'ACTIVE' && membership.academy.id === academyId,
    )?.roles ?? []
  );
}
