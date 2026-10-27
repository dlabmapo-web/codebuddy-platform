import { afterEach, expect, it, vi } from 'vitest';
const { links, cookies, session } = vi.hoisted(() => ({
  links: [] as Array<{ url: string; headers: () => Promise<Record<string, string>> }>,
  cookies: { get: vi.fn(() => ({ value: 'TEACHER' })) },
  session: { access_token: 'fixture-token' },
}));
vi.mock('@orpc/client', () => ({ createORPCClient: (link: unknown) => link }));
vi.mock('@orpc/client/fetch', () => ({ RPCLink: class { constructor(options: typeof links[number]) { links.push(options); } } }));
vi.mock('next/headers', () => ({ cookies: async () => cookies }));
vi.mock('@/lib/config', () => ({ publicConfig: { apiUrl: 'https://api.fixture.invalid/api/rpc' } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getSession: async () => ({ data: { session } }) } }) }));
import { createServerORPCClient, createPlatformServerORPCClient } from './orpc-server';
afterEach(() => { links.length = 0; vi.unstubAllEnvs(); });
it('uses the private runtime RPC address while preserving identity and role headers', async () => {
  vi.stubEnv('INTERNAL_API_RPC_URL', ' http://api:4000/api/rpc ');
  vi.stubEnv('BFF_SHARED_SECRET', 'fixture-secret');
  createServerORPCClient('explicit-token', '192.0.2.1');
  expect(links[0]?.url).toBe('http://api:4000/api/rpc');
  expect(await links[0]!.headers()).toEqual({ Authorization: 'Bearer explicit-token', 'X-Cove-View-Role': 'TEACHER', 'X-Cove-Bff-Secret': 'fixture-secret', 'X-Cove-Client-Ip': '192.0.2.1' });
});
it('falls back to the public RPC and keeps platform reads independent of the role cookie', async () => {
  vi.stubEnv('INTERNAL_API_RPC_URL', '');
  vi.stubEnv('BFF_SHARED_SECRET', '');
  createPlatformServerORPCClient();
  expect(links[0]?.url).toBe('https://api.fixture.invalid/api/rpc');
  expect(await links[0]!.headers()).toEqual({ Authorization: 'Bearer fixture-token' });
});
