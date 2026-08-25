import type { NextRequest } from 'next/server';

import { updateSupabaseSession } from '@/lib/supabase/proxy';

export async function proxy(req: NextRequest) {
  return updateSupabaseSession(req);
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/welcome',
    '/pending',
    '/invite/:path*',
    '/account',
    '/auth/:path*',
    '/academy/:path*',
    '/admin/:path*',
    '/studio/:path*',
  ],
};
