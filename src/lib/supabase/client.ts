import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BROWSER_CLIENT_KEY = '__coveSupabaseBrowserClient__';

type BrowserGlobal = typeof globalThis & {
  [BROWSER_CLIENT_KEY]?: SupabaseClient;
};

export function supabaseBrowser(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('supabaseBrowser() can only be used in the browser.');
  }

  const browserGlobal = globalThis as BrowserGlobal;
  const existingClient = browserGlobal[BROWSER_CLIENT_KEY];
  if (existingClient) return existingClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 20 },
    },
  });

  browserGlobal[BROWSER_CLIENT_KEY] = client;
  return client;
}
