import type { UserRole } from '@/lib/types/db';

export type RouteCapability =
  | 'student-learning'
  | 'teacher-dashboard'
  | 'student-monitoring'
  | 'progress-analytics'
  | 'live-feedback'
  | 'admin-management';

export type ProtectedRoute = {
  prefix: string;
  capability: RouteCapability;
  roles: readonly UserRole[];
};

export const ROLE_HOME: Record<UserRole, string> = {
  student: '/problems',
  teacher: '/students',
  admin: '/admin/problems',
};

export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  { prefix: '/problems', capability: 'student-learning', roles: ['student'] },
  { prefix: '/me', capability: 'student-learning', roles: ['student'] },
  { prefix: '/feedback', capability: 'live-feedback', roles: ['teacher'] },
  { prefix: '/dashboard', capability: 'teacher-dashboard', roles: ['teacher'] },
  { prefix: '/students', capability: 'student-monitoring', roles: ['teacher'] },
  { prefix: '/progress', capability: 'progress-analytics', roles: ['teacher'] },
  { prefix: '/admin', capability: 'admin-management', roles: ['admin'] },
] as const;

export const ROLE_RETURN_PREFIXES: Record<UserRole, readonly string[]> = {
  student: ['/problems', '/me'],
  teacher: ['/dashboard', '/students', '/progress'],
  admin: ['/admin'],
};

export function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.find((route) => (
    matchesRoutePrefix(pathname, route.prefix)
  )) ?? null;
}

export function canAccessPath(role: UserRole, pathname: string) {
  const route = getProtectedRoute(pathname);
  return route ? route.roles.includes(role) : true;
}
