import type { AuthError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { resetPassword, validatePasswordReset } from './password-reset';

function authError(code: string): AuthError {
  return { code, message: code, name: 'AuthApiError', status: 400 } as AuthError;
}

function createAuth(options: {
  updateError?: AuthError | null;
  signOutError?: AuthError | null;
  updateThrows?: boolean;
} = {}) {
  return {
    updateUser: options.updateThrows
      ? vi.fn().mockRejectedValue(new Error('network'))
      : vi.fn().mockResolvedValue({ error: options.updateError ?? null }),
    signOut: vi.fn().mockResolvedValue({ error: options.signOutError ?? null }),
  };
}

describe('validatePasswordReset', () => {
  it.each([
    ['an empty password', { newPassword: '', confirmation: '' }, 'REQUIRED'],
    ['a short password', { newPassword: 'short', confirmation: 'short' }, 'TOO_SHORT'],
    ['a mismatch', { newPassword: 'longenough1', confirmation: 'longenough2' }, 'MISMATCH'],
  ])('rejects %s', (_case, input, issue) => {
    expect(validatePasswordReset(input)).toBe(issue);
  });

  it('accepts a matching password at the minimum length', () => {
    expect(validatePasswordReset({
      newPassword: '12345678',
      confirmation: '12345678',
    })).toBeNull();
  });
});

describe('resetPassword', () => {
  const valid = { newPassword: 'a-good-password', confirmation: 'a-good-password' };

  it('updates the password and revokes every other session', async () => {
    const auth = createAuth();

    const result = await resetPassword(auth, valid);

    expect(result).toEqual({ reset: true, otherSessionsRevoked: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: valid.newPassword });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('reports a completed reset when revocation fails', async () => {
    const auth = createAuth({ signOutError: authError('unexpected_failure') });

    expect(await resetPassword(auth, valid)).toEqual({
      reset: true,
      otherSessionsRevoked: false,
    });
  });

  it('does not call the provider for a mismatch', async () => {
    const auth = createAuth();

    const result = await resetPassword(auth, {
      newPassword: 'a-good-password',
      confirmation: 'a-different-one',
    });

    expect(result).toEqual({ reset: false, issue: 'MISMATCH' });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ['weak_password', 'WEAK_PASSWORD'],
    ['same_password', 'SAME_PASSWORD'],
    ['over_request_rate_limit', 'RATE_LIMITED'],
    ['unexpected_failure', 'RESET_FAILED'],
  ])('maps %s to %s and never revokes', async (code, issue) => {
    const auth = createAuth({ updateError: authError(code) });

    expect(await resetPassword(auth, valid)).toEqual({ reset: false, issue });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('survives a provider that throws', async () => {
    const auth = createAuth({ updateThrows: true });

    expect(await resetPassword(auth, valid)).toEqual({
      reset: false,
      issue: 'RESET_FAILED',
    });
  });
});
