import { createBrowserClient } from '@supabase/ssr';

import { publicConfig } from '@/lib/config';

export function createClient() {
  return createBrowserClient(
    publicConfig.supabaseUrl,
    publicConfig.supabasePublishableKey,
    { realtime: { params: { eventsPerSecond: 20 } } },
  );
}

// Kept while v1 realtime code is migrated to the v2 naming convention.
export const supabaseBrowser = createClient;
