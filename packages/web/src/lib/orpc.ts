import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { appContract, type AppContract } from '@cove/shared';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

const link = new RPCLink({
  url: publicConfig.apiUrl,
  headers: async () => {
    const { data } = await createClient().auth.getSession();
    return data.session?.access_token
      ? { Authorization: `Bearer ${data.session.access_token}` }
      : {};
  },
});

export const orpc: ContractRouterClient<AppContract> = createORPCClient(link);
export { appContract };
