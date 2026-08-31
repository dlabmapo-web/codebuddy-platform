import { ORPCError } from '@orpc/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({
    delete: mocks.deleteCookie,
    get: mocks.getCookie,
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({
    academyInvitations: { accept: mocks.accept },
  }),
  getAccount: vi.fn(),
}));

vi.mock('@/i18n/server/get-server-translation', () => ({
  getServerTranslation: () => Promise.resolve({ t: (key: string) => key }),
}));

import { acceptInvitationAction } from './actions';

const token = 'c'.repeat(43);

function refusal(code: string, status = 409) {
  return new ORPCError('CONFLICT', { status, data: { code } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCookie.mockReturnValue({ value: token });
});

describe('acceptInvitationAction', () => {
  it('reports the reason the API gave rather than one shared sentence', async () => {
    mocks.accept.mockRejectedValue(refusal('INVITATION_EXPIRED', 410));

    await expect(acceptInvitationAction()).resolves.toEqual({
      message: 'errors:INVITATION_EXPIRED',
    });
  });

  // The case that made the old catch actively misleading: somebody already in
  // the academy was told to check which address they had signed in with.
  it('says so when the account already belongs to the academy', async () => {
    mocks.accept.mockRejectedValue(refusal('MEMBERSHIP_ALREADY_EXISTS'));

    await expect(acceptInvitationAction()).resolves.toEqual({
      message: 'errors:MEMBERSHIP_ALREADY_EXISTS',
    });
    // And the invitation stops following this browser around, because no
    // number of retries can make it succeed.
    expect(mocks.deleteCookie).toHaveBeenCalledWith('cove_invitation');
  });

  it('falls back to the generic message when the failure carries no code', async () => {
    mocks.accept.mockRejectedValue(new Error('socket hang up'));

    await expect(acceptInvitationAction()).resolves.toEqual({
      message: 'error.invitation_failed',
    });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });

  it('clears the cookie and moves on once acceptance succeeds', async () => {
    mocks.accept.mockResolvedValue({});

    await acceptInvitationAction();

    expect(mocks.deleteCookie).toHaveBeenCalledWith('cove_invitation');
    expect(mocks.redirect).toHaveBeenCalledWith('/welcome');
  });

  it('does not call the API when no invitation is in the cookie jar', async () => {
    mocks.getCookie.mockReturnValue(undefined);

    await expect(acceptInvitationAction()).resolves.toEqual({
      message: 'error.invitation_missing',
    });
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
