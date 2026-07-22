import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import type { UserRole } from '@/lib/types/db';
import { updateSupabaseSession } from '@/lib/supabase/proxy';

const COOKIE_NAME = 'pc_token';

const HOME_MAP: Record<UserRole, string> = {
  student: '/problems',
  teacher: '/students',
  admin: '/admin/problems',
};

type RouteRule =
  | { type: 'single'; role: UserRole }
  | { type: 'multi'; roles: UserRole[] };

const ROUTE_RULES: Array<{ prefix: string; rule: RouteRule }> = [
  { prefix: '/problems', rule: { type: 'single', role: 'student' } },
  { prefix: '/me',       rule: { type: 'single', role: 'student' } },
  { prefix: '/feedback', rule: { type: 'single', role: 'teacher' } },
  { prefix: '/dashboard', rule: { type: 'multi', roles: ['teacher', 'admin'] } },
  { prefix: '/students', rule: { type: 'multi', roles: ['teacher', 'admin'] } },
  { prefix: '/progress', rule: { type: 'multi', roles: ['teacher', 'admin'] } },
  { prefix: '/admin',    rule: { type: 'single', role: 'admin' } },
];

const AUTH_PAGES = ['/login', '/signup'];

function getRuleForPath(pathname: string): RouteRule | null {
  for (const { prefix, rule } of ROUTE_RULES) {
    if (pathname.startsWith(prefix)) return rule;
  }
  return null;
}

function isAllowed(role: UserRole, rule: RouteRule): boolean {
  if (rule.type === 'single') return role === rule.role;
  return rule.roles.includes(role);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (pathname.startsWith('/auth')) {
    return updateSupabaseSession(req);
  }

  if (AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        return NextResponse.redirect(new URL(HOME_MAP[payload.role], req.url));
      }
    }
    return NextResponse.next();
  }

  const rule = getRuleForPath(pathname);
  if (!rule) return NextResponse.next();

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return res;
  }

  if (!isAllowed(payload.role, rule)) {
    return NextResponse.redirect(new URL(HOME_MAP[payload.role], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/auth/:path*',
    '/problems/:path*',
    '/me/:path*',
    '/students/:path*',
    '/dashboard/:path*',
    '/progress/:path*',
    '/feedback/:path*',
    '/admin/:path*',
  ],
};
