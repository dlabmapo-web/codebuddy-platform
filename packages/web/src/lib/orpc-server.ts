import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { AppContract } from '@cove/shared';

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
