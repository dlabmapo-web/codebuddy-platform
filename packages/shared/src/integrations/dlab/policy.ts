import type { AcademyRole, PlatformRole } from '../../auth/roles.js';

export const DLAB_OS_ORIGIN = 'https://os.dlabcampus.com';
export const DLAB_OS_BASE_URL = `${DLAB_OS_ORIGIN}/v1`;

/** OS codes are authoritative; unknown codes never acquire staff permissions. */
export function dlabPlatformRole(role: string): PlatformRole {
  return role === 'hq_admin' ? 'ADMIN' : 'USER';
}

export const DLAB_ADMIN_DESTINATION = '/admin/academies';

export function dlabAcademyRole(role: string): AcademyRole | null {
  switch (role) {
    // Latest HQ table supplied by the platform owner on 2026-10-21.
    case 'tutor': return 'TEACHER';
    case 'lab_head': return 'MANAGER';
    case 'instructor':
    case 'so_staff':
    case 'edu_manager': return 'TEAM_LEAD';
    case 'hq_admin': return null;
    default: return 'STUDENT';
  }
}

/** Derived staff grants are always active together; they are not UI modes. */
export function dlabAcademyRoles(role: string): readonly AcademyRole[] {
  switch (dlabAcademyRole(role)) {
    case 'MANAGER': return ['TEACHER', 'TEAM_LEAD', 'MANAGER'];
    case 'TEAM_LEAD': return ['TEACHER', 'TEAM_LEAD'];
    case 'TEACHER': return ['TEACHER'];
    case 'STUDENT': return ['STUDENT'];
    default: return [];
  }
}

/** Reject missing grants as well as unexpected privilege; row order is irrelevant. */
export function dlabMembershipRolesMatch(role: string, primary: AcademyRole, extras: readonly AcademyRole[]): boolean {
  const expected = dlabAcademyRoles(role).filter(value => value !== primary);
  return primary === dlabAcademyRole(role) && extras.length === expected.length
    && new Set(extras).size === extras.length && expected.every(value => extras.includes(value));
}

export function canonicalDlabScope(primary: string, supplied?: readonly string[]): string[] {
  return [...new Set(supplied ?? [primary])].sort();
}

export function dlabEffectiveScope(role: string, primary: string, supplied?: readonly string[]): string[] {
  const scope = canonicalDlabScope(primary, supplied);
  if (role === 'student') return scope.length === 1 && scope[0] === primary ? scope : [];
  if (dlabAcademyRole(role) === 'STUDENT') return scope.includes(primary) ? [primary] : [];
  return scope;
}

export function validDlabAuthorizeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === DLAB_OS_ORIGIN && url.pathname === '/v1/sso/authorize' && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
