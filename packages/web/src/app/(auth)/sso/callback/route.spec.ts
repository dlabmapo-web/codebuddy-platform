import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  post: vi.fn(), account: vi.fn(), begin: vi.fn(), signOut: vi.fn(),
}));
const authUserId = '40000000-0000-4000-8000-000000000001';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'attempt' }) }) }));
vi.mock('@/lib/dlab-sso', () => ({
  dlabEnabled: () => true,
  dlabCookieName: () => 'attempt',
  parseAttempt: () => ({ state: 'state', binding: 'binding' }),
  dlabPost: mocks.post,
  dlabCookie: () => ({ name: 'attempt', value: '' }),
  clearDlabContext: vi.fn(),
  authResponse: (path: string) => NextResponse.redirect(new URL(path, 'https://cove.test')),
  dlabFailure: () => NextResponse.redirect('https://cove.test/login?error=sso'),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: {
    verifyOtp: async () => ({ data: { session: { access_token: 'token', user: { id: '40000000-0000-4000-8000-000000000001' } } } }),
    signOut: mocks.signOut,
  } }),
}));
vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({ auth: { me: mocks.account }, studentSession: { begin: mocks.begin } }),
}));

import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.signOut.mockResolvedValue({});
});

async function complete(destination: string, role: 'MANAGER' | 'TEAM_LEAD' | 'TEACHER' | 'STUDENT') {
  mocks.post.mockResolvedValueOnce({ tokenHash: 'hash', authUserId, ticket: 'a'.repeat(64) });
  mocks.post.mockResolvedValueOnce({ destination, requiresStudentSession: role === 'STUDENT' });
  mocks.account.mockResolvedValue({ user: {
    authUserId, platformRole: 'USER',
    memberships: [{ academy: { slug: 'dlab-mapo' }, status: 'ACTIVE', role }],
  } });
  return GET(new NextRequest('https://cove.test/sso/callback?state=state&code=code'));
}

describe('SSO academy entry', () => {
  it.each([
    ['MANAGER', '/classes'], ['TEAM_LEAD', '/classes'],
    ['TEACHER', '/teach/classes'], ['STUDENT', '/learn/courses'],
  ] as const)('takes %s past the hidden Overview', async (role, suffix) => {
    const response = await complete('/academy/dlab-mapo', role);
    expect(response.headers.get('location')).toBe(`https://cove.test/academy/dlab-mapo${suffix}`);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.begin).toHaveBeenCalledTimes(role === 'STUDENT' ? 1 : 0);
  });

  it('preserves an explicit course deep link', async () => {
    const destination = '/academy/dlab-mapo/learn/courses/course-1';
    expect((await complete(destination, 'STUDENT')).headers.get('location')).toBe(`https://cove.test${destination}`);
  });

  it('still rejects destinations belonging to another academy', async () => {
    const response = await complete('/academy/another-academy/classes', 'TEACHER');
    expect(response.headers.get('location')).toBe('https://cove.test/login?error=sso');
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
