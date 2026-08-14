import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { changePassword, validatePasswordChange } from './change-password';

const valid = {
  currentPassword: 'old-password',
  newPassword: 'new-password',
  confirmation: 'new-password',
};

describe('validatePasswordChange', () => {
  it.each([
    [{ ...valid, currentPassword: '' }, 'CURRENT_REQUIRED'],
    [{ ...valid, newPassword: '' }, 'NEW_REQUIRED'],
    [{ ...valid, newPassword: 'short', confirmation: 'short' }, 'TOO_SHORT'],
    [{ ...valid, newPassword: valid.currentPassword, confirmation: valid.currentPassword }, 'SAME_PASSWORD'],
    [{ ...valid, confirmation: 'different-password' }, 'MISMATCH'],
  ] as const)('rejects invalid input with %s', (input, issue) => {
    expect(validatePasswordChange(input)).toBe(issue);
  });

  it('accepts a complete password change', () => {
    expect(validatePasswordChange(valid)).toBeNull();
  });
});

describe('changePassword', () => {
  it('verifies the current password and then revokes other sessions', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });

    await expect(changePassword({ updateUser, signOut }, valid)).resolves.toEqual({
      changed: true,
      otherSessionsRevoked: true,
    });
    expect(updateUser).toHaveBeenCalledWith({
      current_password: valid.currentPassword,
      password: valid.newPassword,
    });
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0]!,
    );
  });

  it('does not revoke sessions when the current password is wrong', async () => {
    const signOut = vi.fn();
    const error = new AuthApiError('Invalid credentials', 400, 'invalid_credentials');

    await expect(changePassword({
      updateUser: vi.fn().mockResolvedValue({ error }),
      signOut,
    }, valid)).resolves.toEqual({
      changed: false,
      issue: 'CURRENT_INCORRECT',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('reports partial success when revoking other sessions fails', async () => {
    const error = new AuthApiError('Unavailable', 503, 'unexpected_failure');
    await expect(changePassword({
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error }),
    }, valid)).resolves.toEqual({
      changed: true,
      otherSessionsRevoked: false,
    });
  });
});
