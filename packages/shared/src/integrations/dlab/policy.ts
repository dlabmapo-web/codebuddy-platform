import type { AcademyRole } from '../../auth/roles.js';

export const DLAB_OS_ORIGIN = 'https://os.dlabcampus.com';
export const DLAB_OS_BASE_URL = `${DLAB_OS_ORIGIN}/v1`;

/** OS codes are authoritative; unknown codes never acquire staff permissions. */
export function dlabAcademyRole(role: string): AcademyRole {
  switch (role) {
    case 'instructor': return 'TEACHER';
    case 'edu_manager': return 'TEAM_LEAD';
    case 'lab_head': return 'MANAGER';
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
