import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, clientMock } = vi.hoisted(() => {
  const client = { channel: vi.fn() };
  return {
    createClientMock: vi.fn(() => client),
    clientMock: client,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

const BROWSER_CLIENT_KEY = '__coveSupabaseBrowserClient__';

function clearBrowserClient() {
  delete (globalThis as Record<string, unknown>)[BROWSER_CLIENT_KEY];
}

describe('supabaseBrowser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
    createClientMock.mockClear();
    clearBrowserClient();
  });

  afterEach(() => {
    clearBrowserClient();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reuses one client across calls and module reloads', async () => {
    const firstModule = await import('./client');

    expect(firstModule.supabaseBrowser()).toBe(clientMock);
    expect(firstModule.supabaseBrowser()).toBe(clientMock);

    vi.resetModules();
    const reloadedModule = await import('./client');

    expect(reloadedModule.supabaseBrowser()).toBe(clientMock);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('disables unused auth lifecycle behavior', async () => {
    const { supabaseBrowser } = await import('./client');

    supabaseBrowser();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-anon-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        realtime: {
          params: { eventsPerSecond: 20 },
        },
      }
    );
  });

  it('fails clearly when public Supabase configuration is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { supabaseBrowser } = await import('./client');

    expect(() => supabaseBrowser()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
