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
