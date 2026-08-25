import type { AuthMeResponse } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { academyIdentityFromAccount } from './academy-route-policy';

const account = {
  user: {
    memberships: [
      {
        status: 'ACTIVE',
        academy: { id: 'academy-1', slug: 'cove-seoul' },
      },
      {
        status: 'SUSPENDED',
        academy: { id: 'academy-2', slug: 'cove-busan' },
      },
    ],
  },
} as unknown as AuthMeResponse;

describe('academy route identity', () => {
  it('maps an accessible slug to its internal id', () => {
    expect(academyIdentityFromAccount(account, 'cove-seoul')).toEqual({
      academyId: 'academy-1',
      academySlug: 'cove-seoul',
    });
  });

  it('gives unknown and unauthorized slugs the same result', () => {
    expect(academyIdentityFromAccount(account, 'not-real')).toBeNull();
    expect(academyIdentityFromAccount(account, 'cove-busan')).toBeNull();
  });
});
