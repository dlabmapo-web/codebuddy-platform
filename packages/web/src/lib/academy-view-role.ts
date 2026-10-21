import type { AcademyRole, AuthMeResponse } from '@cove/shared';

/** Legacy academy view cookie; retained for compatibility, never authority. */
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

/** Unified staff presentation always uses primary identity and all held grants. */
export function resolveViewRole(input: {
  academyId: string;
  held: readonly AcademyRole[];
  primary: AcademyRole;
  cookie: string | undefined;
}): { role: AcademyRole; stale: boolean } {
  // Staff work in one capability-based interface. Old presentation cookies
  // cannot hide inherited actions or change the member's primary identity.
  const parsed = parseViewRole(input.cookie);
  return {
    role: input.primary,
    stale: Boolean(parsed?.academyId === input.academyId && parsed.role !== input.primary),
  };
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
