import type { AuthError } from '@supabase/supabase-js';

export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
};

export type PasswordChangeIssue =
  | 'CURRENT_REQUIRED'
  | 'NEW_REQUIRED'
  | 'TOO_SHORT'
  | 'SAME_PASSWORD'
  | 'MISMATCH'
  | 'CURRENT_INCORRECT'
  | 'WEAK_PASSWORD'
  | 'RATE_LIMITED'
  | 'CHANGE_FAILED';

export type PasswordChangeResult =
  | { changed: true; otherSessionsRevoked: true }
  | { changed: true; otherSessionsRevoked: false }
  | { changed: false; issue: PasswordChangeIssue };

type PasswordAuth = {
  updateUser(attributes: {
    current_password: string;
    password: string;
  }): Promise<{ error: AuthError | null }>;
  signOut(options: { scope: 'others' }): Promise<{ error: AuthError | null }>;
};

export function validatePasswordChange(
  input: PasswordChangeInput,
): PasswordChangeIssue | null {
  if (!input.currentPassword) return 'CURRENT_REQUIRED';
  if (!input.newPassword) return 'NEW_REQUIRED';
  if (input.newPassword.length < 8) return 'TOO_SHORT';
  if (input.newPassword === input.currentPassword) return 'SAME_PASSWORD';
  if (input.newPassword !== input.confirmation) return 'MISMATCH';
  return null;
}

/**
 * Supabase owns both credential verification and session revocation.
 * Password values never cross a Cove API route or enter application logs.
 */
export async function changePassword(
  auth: PasswordAuth,
  input: PasswordChangeInput,
): Promise<PasswordChangeResult> {
  const validation = validatePasswordChange(input);
  if (validation) return { changed: false, issue: validation };

  try {
    const { error } = await auth.updateUser({
      current_password: input.currentPassword,
      password: input.newPassword,
    });
    if (error) {
      return { changed: false, issue: issueForAuthError(error) };
    }

    const { error: signOutError } = await auth.signOut({ scope: 'others' });
    return signOutError
      ? { changed: true, otherSessionsRevoked: false }
      : { changed: true, otherSessionsRevoked: true };
  } catch {
    return { changed: false, issue: 'CHANGE_FAILED' };
  }
}

function issueForAuthError(error: AuthError): PasswordChangeIssue {
  switch (error.code) {
    case 'invalid_credentials':
      return 'CURRENT_INCORRECT';
    case 'weak_password':
      return 'WEAK_PASSWORD';
    case 'same_password':
      return 'SAME_PASSWORD';
    case 'over_request_rate_limit':
      return 'RATE_LIMITED';
    default:
      return 'CHANGE_FAILED';
  }
}
