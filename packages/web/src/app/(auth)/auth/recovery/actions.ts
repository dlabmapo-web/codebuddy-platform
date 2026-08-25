'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { usernameSchema } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';

import { clientAddress } from '../../_lib/client-address';
import {
  passwordResetField,
  passwordResetMessageKeys,
  resetPassword,
} from '../../_lib/password-reset';
import {
  issueRecoveryCapability,
  recoveryCookieName,
  recoveryCookieOptions,
  recoverySecret,
} from '../../_lib/recovery-capability';
import { recoverySubject } from '../../_lib/recovery-session';

export type RecoveryRequestState =
  | { status: 'idle' }
  | { status: 'invalid'; message: string }
  | { status: 'accepted' };

export type PasswordResetState =
  | { status: 'idle' }
  | { status: 'error'; message: string; field: 'newPassword' | 'confirmation' | null }
  | { status: 'unauthorized'; message: string };

/**
 * Asks for a recovery email by username.
 *
 * Format is checked here because rejecting `min` for being four characters
 * says nothing about who holds an account — every other outcome is the same
 * accepted state, whether the name is unknown, social-only, suspended, or a
 * perfectly ordinary password account whose email is on its way.
 */
export async function requestPasswordRecoveryAction(
  _state: RecoveryRequestState,
  formData: FormData,
): Promise<RecoveryRequestState> {
  const input = usernameSchema.safeParse(formData.get('username'));
  const rawCaptchaToken = formData.get('captchaToken');
  const captchaToken = typeof rawCaptchaToken === 'string'
    ? rawCaptchaToken.trim().slice(0, 4096)
    : '';
  const { t } = await getServerTranslation(['auth', 'validation']);
  if (!input.success) {
    return { status: 'invalid', message: t('validation:username_invalid') };
  }

  try {
    await createServerORPCClient(undefined, await clientAddress())
      .auth.requestPasswordRecovery({
        username: input.data,
        ...(captchaToken ? { captchaToken } : {}),
      });
  } catch {
    // An API or provider outage must not be distinguishable from a delivered
    // email either — that difference would answer the same question the body
    // refuses to. The failure is recorded on the API side, without the name.
  }

  return { status: 'accepted' };
}

/**
 * Exchanges the emailed token hash for a Supabase recovery session and a Cove
 * recovery capability.
 *
 * Only ever reached by the interstitial's POST. Mail scanners and link
 * previewers follow the GET, and a one-time token that a scanner has already
 * spent is a recovery link that fails for the person it was sent to.
 */
export async function confirmPasswordRecoveryAction(
  formData: FormData,
): Promise<void> {
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');
  const invalid = '/forgot-password?error=invalid-link';

  if (
    typeof tokenHash !== 'string' || tokenHash.length === 0 ||
    type !== 'recovery'
  ) {
    redirect(invalid);
  }

  const secret = recoverySecret();
  if (!secret) {
    // No signing key, no capability, and a recovery session with nothing to
    // authorize is worse than none at all. Refuse before spending the token.
    redirect(invalid);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  });
  const subject = data?.user?.id;
  if (error || !subject) {
    redirect(invalid);
  }

  const capability = await issueRecoveryCapability(subject, secret);
  (await cookies()).set(
    recoveryCookieName,
    capability,
    recoveryCookieOptions,
  );

  // Without the hash or the type: the reset page needs neither, and a URL is
  // the one place a secret reliably survives — in history, in a referrer, and
  // in whatever proxy logged the request.
  redirect('/reset-password');
}

/**
 * Sets the new password.
 *
 * Both authorizations are required and neither substitutes for the other: the
 * Supabase session says which account Supabase will update, and the capability
 * says that this session came from a recovery link rather than from an
 * ordinary sign-in.
 */
export async function resetPasswordAction(
  _state: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const { t } = await getServerTranslation(['auth']);
  const supabase = await createClient();
  const cookieStore = await cookies();

  const subject = await recoverySubject();
  if (!subject) {
    cookieStore.delete({ name: recoveryCookieName, path: recoveryCookieOptions.path });
    return { status: 'unauthorized', message: t('reset.error_unauthorized') };
  }

  const result = await resetPassword(supabase.auth, {
    newPassword: String(formData.get('newPassword') ?? ''),
    confirmation: String(formData.get('confirmation') ?? ''),
  });

  if (!result.reset) {
    // The capability survives a correctable mistake. Sending someone back to
    // their inbox because they typed seven characters would be a worse flow
    // than the one this replaces.
    return {
      status: 'error',
      message: t(passwordResetMessageKeys[result.issue]),
      field: passwordResetField[result.issue],
    };
  }

  cookieStore.delete({ name: recoveryCookieName, path: recoveryCookieOptions.path });
  if (!result.otherSessionsRevoked) {
    // The password did change. Global revocation did not, which is an
    // operational problem — but this browser must not keep a session the reset
    // was meant to end.
    console.error('Password recovery completed without global revocation');
    await supabase.auth.signOut({ scope: 'local' });
  }

  redirect('/login?reset=success');
}
