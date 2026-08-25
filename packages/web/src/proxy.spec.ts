import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh } = vi.hoisted(() => ({
  refresh: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
}));

vi.mock('@/lib/supabase/proxy', () => ({
  updateSupabaseSession: refresh,
}));

import { config, proxy } from './proxy';

describe('Cove Studio proxy', () => {
  beforeEach(() => refresh.mockClear());

  it('covers every canonical authenticated route family', () => {
    expect(config.matcher).toEqual(expect.arrayContaining([
      '/',
      '/account',
      '/academy/:path*',
      '/admin/:path*',
      '/welcome',
      '/pending',
      '/invite/:path*',
      '/auth/:path*',
      '/studio/:path*',
    ]));
  });

  it.each([
    '/',
    '/account',
    '/academy/cove-seoul/classes',
    '/admin/academies',
    '/welcome',
    '/pending',
    '/invite/token',
    '/auth/callback',
    '/studio/academies/legacy-id/content/courses',
  ])('refreshes the Supabase session for %s', async (pathname) => {
    const request = { nextUrl: { pathname } } as unknown as NextRequest;
    await proxy(request);
    expect(refresh).toHaveBeenCalledWith(request);
  });
});
