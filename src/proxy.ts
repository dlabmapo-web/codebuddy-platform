import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import type { UserRole } from '@/lib/types/db';

const COOKIE_NAME = 'pc_token';

const ROLE_PATHS: Record<string, UserRole> = {
  '/problems': 'student',
  '/me': 'student',
  '/students': 'teacher',
  '/progress': 'teacher',
  '/feedback': 'teacher',
};

function getRoleForPath(pathname: string): UserRole | null {
  if (pathname.startsWith('/admin')) return 'admin';
  for (const [prefix, role] of Object.entries(ROLE_PATHS)) {
    if (pathname.startsWith(prefix)) return role;
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const requiredRole = getRoleForPath(pathname);
  if (!requiredRole) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (payload.role !== requiredRole) {
    const homeMap: Record<UserRole, string> = {
      student: '/problems',
      teacher: '/students',
      admin: '/admin/problems',
    };
    return NextResponse.redirect(new URL(homeMap[payload.role], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/problems/:path*',
    '/me/:path*',
    '/students/:path*',
    '/progress/:path*',
    '/feedback/:path*',
    '/admin/:path*',
  ],
};
