import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import {
  ROLE_HOME,
  getProtectedRoute,
  matchesRoutePrefix,
} from '@/lib/navigation/capabilities';

const COOKIE_NAME = 'pc_token';

const AUTH_PAGES = ['/login', '/signup'];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (AUTH_PAGES.some((page) => matchesRoutePrefix(pathname, page))) {
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        return NextResponse.redirect(new URL(ROLE_HOME[payload.role], req.url));
      }
    }
    return NextResponse.next();
  }

  const route = getProtectedRoute(pathname);
  if (!route) return NextResponse.next();

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return res;
  }

  if (!route.roles.includes(payload.role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[payload.role], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/problems/:path*',
    '/me/:path*',
    '/students/:path*',
    '/dashboard/:path*',
    '/progress/:path*',
    '/feedback/:path*',
    '/admin/:path*',
  ],
};
