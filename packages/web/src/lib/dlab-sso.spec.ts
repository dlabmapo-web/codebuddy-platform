import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), verify: vi.fn(), signOut: vi.fn(), begin: vi.fn(), me: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => m }));
vi.mock('@/lib/config', () => ({ publicConfig: { siteUrl: 'https://cs.coveedu.com', apiUrl: 'https://api.coveedu.com/api/rpc' } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { verifyOtp: m.verify, signOut: m.signOut } }) }));
vi.mock('@/lib/orpc-server', () => ({ createServerORPCClient: () => ({ studentSession: { begin: m.begin }, auth: { me: m.me } }) }));
import { GET as start } from '@/app/(auth)/sso/start/route';
import { GET as callback } from '@/app/(auth)/sso/callback/route';
import { parseAttempt } from './dlab-sso';
const state = 'a'.repeat(64), binding = 'b'.repeat(64), ticket = 'c'.repeat(64), uid = '2b34df97-0f05-477c-b902-6995f02dcd4b';
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DLAB_SSO_ENABLED', 'true');
  vi.stubEnv('BFF_SHARED_SECRET', 'fake-bff-for-boundary-test');
  m.get.mockReturnValue({ value: `${binding}.${state}` });
  m.verify.mockResolvedValue({ data: { session: { access_token: 'fake-access', user: { id: uid } } }, error: null });
  m.signOut.mockResolvedValue({ error: null });
  m.begin.mockResolvedValue({}); m.me.mockResolvedValue({ user: { authUserId: uid, memberships: [{ academy: { slug: 'dlab-mapo' }, status: 'ACTIVE', role: 'STUDENT' }] } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('DLAB browser start and callback', () => {
  it('starts via GET and sets a bound HttpOnly cookie without exposing server credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state, authorizeUrl: `https://os.dlabcampus.com/v1/sso/authorize?state=${state}` })));
    vi.stubGlobal('fetch', fetcher);
    const result = await start(new NextRequest('https://internal.test/sso/start'));
    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toContain('https://os.dlabcampus.com/v1/sso/authorize');
    expect(result.headers.get('set-cookie')).toContain('HttpOnly');
    expect(result.headers.get('set-cookie')).toContain('SameSite=lax');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(fetcher.mock.calls[0]![1].headers['X-Cove-Bff-Secret']).toBe('fake-bff-for-boundary-test');
    expect(result.headers.get('location')).not.toContain('fake-bff');
  });
  it('rejects a malformed attempt cookie', () => expect(parseAttempt('forged')).toBeNull());
  it('does not exchange mismatched state', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await callback(new NextRequest('https://internal.test/sso/callback?state=wrong&code=secret-code'));
    expect(result.headers.get('location')).toBe('https://cs.coveedu.com/sso/error');
    expect(fetcher).not.toHaveBeenCalled(); expect(m.verify).not.toHaveBeenCalled();
  });
  it('rejects duplicate query parameters before code exchange', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=one&code=two`));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bridges server-side, activates the session, begins inactivity policy, and redirects cleanly', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tokenHash: 'private-hash', authUserId: uid, ticket }))).mockResolvedValueOnce(new Response(JSON.stringify({ destination: '/academy/dlab-mapo', requiresStudentSession: true })));
    vi.stubGlobal('fetch', fetcher);
    const result = await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=private-code`));
    expect(m.verify).toHaveBeenCalledWith({ token_hash: 'private-hash', type: 'email' });
    expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe('Bearer fake-access');
    expect(m.begin).toHaveBeenCalledOnce(); expect(m.me).toHaveBeenCalledOnce();
    expect(result.headers.get('location')).toBe('https://cs.coveedu.com/academy/dlab-mapo');
    expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(result.headers.get('location')).not.toMatch(/code|state|token|hash/);
  });
  it('clears a newly issued mismatched session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ tokenHash: 'private-hash', authUserId: uid, ticket }))));
    m.verify.mockResolvedValue({ data: { session: { access_token: 'wrong', user: { id: 'different-user' } } }, error: null });
    const result = await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=private-code`));
    expect(m.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(m.begin).not.toHaveBeenCalled();
    expect(result.headers.get('location')).toBe('https://cs.coveedu.com/sso/error');
  });
  it('fails closed when the required student lease cannot be started', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tokenHash: 'private-hash', authUserId: uid, ticket }))).mockResolvedValueOnce(new Response(JSON.stringify({ destination: '/academy/dlab-mapo', requiresStudentSession: true }))));
    m.begin.mockRejectedValue(new Error('Redis unavailable'));
    const result = await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=private-code`));
    expect(m.signOut).toHaveBeenCalledOnce(); expect(result.headers.get('location')).toContain('/sso/error');
  });
  it('does not call the API when the runtime feature is disabled', async () => {
    vi.stubEnv('DLAB_SSO_ENABLED', 'false');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const result = await start(new NextRequest('https://internal.test/sso/start'));
    expect(result.headers.get('location')).toContain('/sso/error'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('activates staff without starting a student lease', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tokenHash: 'private-hash', authUserId: uid, ticket }))).mockResolvedValueOnce(new Response(JSON.stringify({ destination: '/academy/dlab-mapo', requiresStudentSession: false }))));
    m.me.mockResolvedValue({ user: { authUserId: uid, memberships: [{ academy: { slug: 'dlab-mapo' }, status: 'ACTIVE', role: 'TEACHER' }] } });
    const result = await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=private-code`));
    expect(result.headers.get('location')).toBe('https://cs.coveedu.com/academy/dlab-mapo');
    expect(m.begin).not.toHaveBeenCalled();
  });
  it('rejects a trusted response selecting an academy absent from the activated account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tokenHash: 'private-hash', authUserId: uid, ticket }))).mockResolvedValueOnce(new Response(JSON.stringify({ destination: '/academy/other-campus', requiresStudentSession: false }))));
    const result = await callback(new NextRequest(`https://internal.test/sso/callback?state=${state}&code=private-code`));
    expect(result.headers.get('location')).toContain('/sso/error'); expect(m.signOut).toHaveBeenCalledOnce();
  });
  it('does not redirect to the retired OS hostname', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ state, authorizeUrl: 'https://dlab-os.onrender.com/v1/sso/authorize' }))));
    const result = await start(new NextRequest('https://internal.test/sso/start'));
    expect(result.headers.get('location')).toContain('/sso/error');
  });

});
