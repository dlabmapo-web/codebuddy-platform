import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { appContract, type AppContract } from '@cove/shared';

import { publicConfig } from '@/lib/config';
import { shouldForwardViewRole } from '@/lib/orpc-view-role';
import { createClient } from '@/lib/supabase/client';

const link = new RPCLink({
  url: publicConfig.apiUrl,
  headers: async () => {
    const { data } = await createClient().auth.getSession();
    const headers: Record<string, string> = {};
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    // Which academy role a platform operator is standing in.
    //
    // Academy-owned pages send this from both server and browser: a server
    // render and a client refetch must ask the API the same question. Console
    // routes are the deliberate exception; they administer through the
    // platform Manager view and ignore a stale diagnostic cookie.
    const viewRole = shouldForwardViewRole() ? readViewRole() : null;
    if (viewRole) headers['X-Cove-View-Role'] = viewRole;
    return headers;
  },
});

/**
 * The operator's chosen role, from the cookie the console sets.
 *
 * Deliberately not `httpOnly`: the browser client needs to read it, and it
 * carries no authority of its own — the API establishes that the caller is an
 * operator before it consults this at all.
 */
function readViewRole(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export const orpc: ContractRouterClient<AppContract> = createORPCClient(link);
export { appContract };
