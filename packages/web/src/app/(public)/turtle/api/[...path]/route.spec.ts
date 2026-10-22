import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => jar }));
import { GET } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_TURTLE_TRIAL_ENABLED', 'true');
  vi.stubEnv('TURTLE_TRIAL_ENABLED', 'true');
  vi.stubEnv('BFF_SHARED_SECRET', 'test-bff-secret');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const get = (path: string) => GET(new Request('http://localhost:3000/turtle/api/' + path), {
  params: Promise.resolve({ path: path.split('/') }),
});

describe('public turtle access restoration', () => {
  it('opens the PIN gate without a failed request when no grant exists', async () => {
    const response = await get('bootstrap');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('clears an expired grant and returns to the PIN gate quietly', async () => {
    jar.get.mockReturnValue({ value: 'expired-grant' });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'ACCESS_EXPIRED' }), { status: 401 }));
    const response = await get('bootstrap');
    expect(response.status).toBe(204);
    expect(response.cookies.get('cove-turtle-dev')?.value).toBe('');
  });

  it('still rejects unauthorized attempts to read a drawing session', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'ACCESS_EXPIRED' }), { status: 401 }));
    const response = await get('runs/00000000-0000-4000-8000-000000000001');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'ACCESS_EXPIRED' });
  });
});
