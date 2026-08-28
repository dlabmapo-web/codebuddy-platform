import type { AuthMeResponse } from '@cove/shared';

import { authDestination } from '@/lib/academy-access-state';
import { getAccount } from '@/lib/orpc-server';

export function signedOutOnlyDestination(
  account: AuthMeResponse | null,
): string | null {
  return account ? authDestination(account) : null;
}

/** Return the existing account's home, or null when this is a signed-out visit. */
export async function currentAccountDestination(): Promise<string | null> {
  try {
    const account = await getAccount();
    return signedOutOnlyDestination(account);
  } catch {
    return null;
  }
}
