import type { AuthError } from '@supabase/supabase-js';

import type { TranslationKey } from '@/i18n';

/**
 * Setting a password from a recovery link, as opposed to changing one from My
 * Page. The difference is what stands in for the current password: there is
 * none to type, so the recovery session and the Cove capability are what
 * authorize the update, and both are checked before this runs.
 */
export type PasswordResetInput = {
  newPassword: string;
  confirmation: string;
};

export type PasswordResetIssue =
  | 'REQUIRED'
  | 'TOO_SHORT'
  | 'MISMATCH'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD'
  | 'RATE_LIMITED'
  | 'RESET_FAILED';

export type PasswordResetResult =
  | { reset: true; otherSessionsRevoked: boolean }
  | { reset: false; issue: PasswordResetIssue };

type ResetAuth = {
  updateUser(attributes: { password: string }): Promise<
    { error: AuthError | null }
  >;
  signOut(options: { scope: 'global' }): Promise<{ error: AuthError | null }>;
};

/** The same eight-character floor the signup and My Page forms enforce. */
export const passwordMinLength = 8;

export function validatePasswordReset(
  input: PasswordResetInput,
): PasswordResetIssue | null {
  if (!input.newPassword) return 'REQUIRED';
  if (input.newPassword.length < passwordMinLength) return 'TOO_SHORT';
  if (input.newPassword !== input.confirmation) return 'MISMATCH';
  return null;
}

/**
 * Updates the password, then ends every session the old one opened.
 *
 * The revocation is deliberately not allowed to undo the reset. Once Supabase
 * has accepted the new password, the person's password *is* the new one; a
 * failure to revoke elsewhere is an operational problem, not a reason to send
 * them back to a form whose work already landed.
 */
export async function resetPassword(
  auth: ResetAuth,
  input: PasswordResetInput,
): Promise<PasswordResetResult> {
  const validation = validatePasswordReset(input);
  if (validation) return { reset: false, issue: validation };

  let updateError: AuthError | null;
  try {
    ({ error: updateError } = await auth.updateUser({
      password: input.newPassword,
    }));
  } catch {
    return { reset: false, issue: 'RESET_FAILED' };
  }
  if (updateError) {
    return { reset: false, issue: resetIssueForAuthError(updateError) };
  }

  try {
    const { error } = await auth.signOut({ scope: 'global' });
    return { reset: true, otherSessionsRevoked: !error };
  } catch {
    return { reset: true, otherSessionsRevoked: false };
  }
}

export function resetIssueForAuthError(error: AuthError): PasswordResetIssue {
  switch (error.code) {
    case 'weak_password':
      return 'WEAK_PASSWORD';
    case 'same_password':
      return 'SAME_PASSWORD';
    case 'over_request_rate_limit':
      return 'RATE_LIMITED';
    default:
      return 'RESET_FAILED';
  }
}

/**
 * The copy key for an issue. Kept beside the issue itself so a new one cannot
 * be added without deciding what the person reading it is told.
 */
export const passwordResetMessageKeys: Record<
  PasswordResetIssue,
  TranslationKey<'auth'>
> = {
  REQUIRED: 'reset.error_required',
  TOO_SHORT: 'reset.error_too_short',
  MISMATCH: 'reset.error_mismatch',
  WEAK_PASSWORD: 'reset.error_weak',
  SAME_PASSWORD: 'reset.error_same',
  RATE_LIMITED: 'reset.error_rate_limited',
  RESET_FAILED: 'reset.error_failed',
};

/** Which field an issue belongs to, so focus can move to it. */
export const passwordResetField: Record<PasswordResetIssue, 'newPassword' | 'confirmation' | null> = {
  REQUIRED: 'newPassword',
  TOO_SHORT: 'newPassword',
  MISMATCH: 'confirmation',
  WEAK_PASSWORD: 'newPassword',
  SAME_PASSWORD: 'newPassword',
  RATE_LIMITED: null,
  RESET_FAILED: null,
};
