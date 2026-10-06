import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(), signOut: vi.fn(), complete: vi.fn(), begin: vi.fn(),
  has: vi.fn(), get: vi.fn(), delete: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => mocks }));
vi.mock('@/lib/config', () => ({ publicConfig: { siteUrl: 'https://cove.test' } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut } }),
}));
vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({
    auth: { completeOAuthOnboarding: mocks.complete },
    studentSession: { begin: mocks.begin },
  }),
}));
vi.mock('@/lib/academy-access-state', () => ({ authDestination: () => '/academy/test' }));
import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('social login callback', () => {
  it.each(['google', 'naver'])('takes a new %s user straight to staff signup', async (provider) => {
    mocks.exchange.mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { app_metadata: { provider } } } }, error: null,
    });
    mocks.complete.mockRejectedValue({ code: 'OAUTH_ONBOARDING_INTENT_REQUIRED' });
    const response = await GET(new NextRequest('https://internal.test/auth/callback?code=test'));
    expect(response.headers.get('location')).toBe('https://cove.test/signup?kind=staff');
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.delete).toHaveBeenCalledWith('cove_oauth_intent');
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it.each(['google', 'naver', 'kakao'])('keeps existing %s users on their normal landing route without signup', async (provider) => {
    mocks.exchange.mockResolvedValue({
      data: { session: { access_token: 'test-token', user: { app_metadata: { provider } } } }, error: null,
    });
    mocks.complete.mockResolvedValue({});
    const response = await GET(new NextRequest('https://internal.test/auth/callback?code=test'));
    expect(response.headers.get('location')).toBe('https://cove.test/academy/test');
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledWith({});
    expect(mocks.exchange).toHaveBeenCalledWith('test');
  });

  it('preserves invitation routing', async () => {
    mocks.has.mockReturnValue(true);
    const response = await GET(new NextRequest('https://internal.test/auth/callback?code=test'));
    expect(response.headers.get('location')).toBe('https://cove.test/invite');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('preserves the expired academy-selection intent message', async () => {
    mocks.complete.mockRejectedValue({ code: 'OAUTH_ONBOARDING_INTENT_EXPIRED' });
    const response = await GET(new NextRequest('https://internal.test/auth/callback?code=test'));
    expect(response.headers.get('location')).toBe('https://cove.test/signup?error=academy-required');
  });

  it('returns to login when provider consent is cancelled', async () => {
    const response = await GET(new NextRequest('https://internal.test/auth/callback?error=access_denied'));
    expect(response.headers.get('location')).toBe('https://cove.test/login');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
