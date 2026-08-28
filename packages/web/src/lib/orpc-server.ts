import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { AppContract, AuthMeResponse } from '@cove/shared';
import { cache } from 'react';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export function createServerORPCClient(
  accessToken?: string,
  forwardedClientAddress?: string,
): ContractRouterClient<AppContract> {
  const link = new RPCLink({
    url: publicConfig.apiUrl,
    headers: async () => {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      } else {
        const { data } = await (await createClient()).auth.getSession();
        if (data.session?.access_token) {
          headers.Authorization = `Bearer ${data.session.access_token}`;
        }
      }
      const bffSecret = process.env.BFF_SHARED_SECRET;
      if (bffSecret) {
        headers['X-Cove-Bff-Secret'] = bffSecret;
        if (forwardedClientAddress) {
          headers['X-Cove-Client-Ip'] = forwardedClientAddress;
        }
      }
      return headers;
    },
  });
  return createORPCClient(link);
}

/**
 * The signed-in account, fetched once per request.
 *
 * `auth.me` is the most-called endpoint in the app and, before this, only one
 * of its callers was memoised. Rendering a single studio page asked for the
 * same account three times over three separate round trips — the academy
 * layout, the page, and the shell each fetching it — mostly in sequence, on the
 * critical path of every navigation. `cache` collapses them: the first caller
 * in a request pays, every later one gets the same promise.
 *
 * The session token is read here and handed to the client, rather than left
 * for the link to resolve lazily. A layout and a page render in parallel, and
 * resolving the token inside the link can lose the request context — which
 * fails *open*, sending an unauthenticated call that answers as though nobody
 * were signed in. The academy layout worked around that locally; this is the
 * same fix in the one place every caller shares.
 *
 * Throws when there is no session, so a caller that treats an unreadable
 * account as signed-out keeps its existing `try`/`catch` or `.catch(() => null)`.
 */
export const getAccount = cache(async (): Promise<AuthMeResponse> => {
  const { data } = await (await createClient()).auth.getSession();
  if (!data.session) throw new Error('No authenticated session');
  return createServerORPCClient(data.session.access_token).auth.me({});
});
