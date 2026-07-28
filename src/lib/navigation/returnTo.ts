import type { UserRole } from '@/lib/types/db';
import {
  ROLE_RETURN_PREFIXES,
  matchesRoutePrefix,
} from './capabilities';

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

export function currentInternalRoute({
  pathname,
  search,
}: {
  pathname: string;
  search?: string;
}) {
  const query = search?.startsWith('?') ? search : search ? `?${search}` : '';
  return `${pathname}${query}`;
}

export function encodeReturnTo(route: string) {
  return encodeURIComponent(route);
}

export function validateReturnTo(
  candidate: string | null | undefined,
  role: UserRole,
) {
  if (!candidate || CONTROL_CHARACTER.test(candidate)) return null;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (SCHEME.test(candidate)) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://cove.local');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://cove.local') return null;
  const allowed = ROLE_RETURN_PREFIXES[role].some((prefix) => (
    matchesRoutePrefix(parsed.pathname, prefix)
  ));
  return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
}

export function resolveReturnTo({
  candidate,
  role,
  fallback,
}: {
  candidate: string | null | undefined;
  role: UserRole;
  fallback: string;
}) {
  return validateReturnTo(candidate, role) ?? fallback;
}

export function withReturnTo(pathname: string, returnTo: string) {
  const separator = pathname.includes('?') ? '&' : '?';
  return `${pathname}${separator}returnTo=${encodeReturnTo(returnTo)}`;
}

