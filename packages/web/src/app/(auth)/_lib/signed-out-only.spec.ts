import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthMeResponse } from '@cove/shared';

const { authMe } = vi.hoisted(() => ({
  authMe: vi.fn(),
}));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({ auth: { me: authMe } }),
}));

import {
  currentAccountDestination,
  signedOutOnlyDestination,
} from './signed-out-only';

function account(
  overrides: Partial<AuthMeResponse['user']> = {},
): AuthMeResponse {
  return {
    user: {
      id: '30000000-0000-4000-8000-000000000001',
      authUserId: '40000000-0000-4000-8000-000000000001',
      email: 'user@cove.test',
      username: 'cove-user',
      displayName: 'Cove User',
      avatarUrl: null,
      imageUrl: null,
      platformRole: 'USER',
      status: 'ACTIVE',
      memberships: [],
      applications: [],
      ...overrides,
    },
  };
}

describe('signed-out-only route policy', () => {
  beforeEach(() => authMe.mockReset());

  it('renders authentication routes for a signed-out visitor', () => {
    expect(signedOutOnlyDestination(null)).toBeNull();
  });

  it('uses the standard post-authentication destination for a member', () => {
    expect(signedOutOnlyDestination(account({
      memberships: [{
        academy: {
          id: '20000000-0000-4000-8000-000000000001',
          name: 'Cove Development Academy',
          slug: 'cove-development',
        },
        role: 'STUDENT',
        status: 'ACTIVE',
        imageUrl: null,
      }],
    }))).toBe('/academy/cove-development');
  });

  it('preserves pending, welcome, and platform-admin destination policy', () => {
    expect(signedOutOnlyDestination(account())).toBe('/welcome');
    expect(signedOutOnlyDestination(account({
      platformRole: 'ADMIN',
    }))).toBe('/admin');
  });

  it('returns the signed-in account destination from the server session', async () => {
    authMe.mockResolvedValue(account({ platformRole: 'ADMIN' }));
    await expect(currentAccountDestination()).resolves.toBe('/admin');
  });
});
