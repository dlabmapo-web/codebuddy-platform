'use server';

import { redirect, RedirectType } from 'next/navigation';
import { cookies } from 'next/headers';
import { z } from 'zod';
import type { Provider } from '@supabase/supabase-js';
import {
  socialAuthProviderSchema,
  usernameSchema,
  type SocialAuthProvider,
} from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { toApiError } from '@/lib/api-errors';
import { publicConfig } from '@/lib/config';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';

import { isSocialProviderAvailable } from './_components/social-providers';
import { clientAddress } from './_lib/client-address';

export type AuthFormState = { message?: string; success?: boolean };

type CaptchaInput =
  | { valid: true; token?: string }
  | { valid: false };

function captchaInput(formData: FormData): CaptchaInput {
  const raw = formData.get('captchaToken');
  if (typeof raw !== 'string') {
    return publicConfig.turnstileSiteKey ? { valid: false } : { valid: true };
  }

  const token = raw.trim();
  if (!token) {
    return publicConfig.turnstileSiteKey ? { valid: false } : { valid: true };
  }
  return token.length <= 4096
    ? { valid: true, token }
    : { valid: false };
}

/**
 * Deliberately not `usernameSchema`. The field is labelled as a username and
 * that is what people are told to type, but an account created before usernames
 * existed still has only an email to sign in with, so the field has to carry
 * one. Which of the two it is stays the resolver's decision.
 */
const credentialsSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(8),
});

const signupSchema = z.object({
  username: usernameSchema,
  email: z.email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(2).max(100),
  academyId: z.uuid(),
});

const socialAuthSchema = z.object({
  provider: socialAuthProviderSchema,
  academyId: z.uuid().optional(),
});

export async function loginAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = credentialsSchema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password'),
  });
  const { t } = await getServerTranslation(['auth', 'validation']);
  if (!input.success) {
    return { message: t('validation:credentials_invalid') };
  }

  const captcha = captchaInput(formData);
  if (!captcha.valid) return { message: t('error.captcha_failed') };

  // Supabase authenticates a password against an address, never a name, so the
  // username is exchanged for one first. An unknown name resolves to an address
  // that cannot exist, which is what makes the rejection below identical
  // whether the name was wrong or the password was.
  let email: string;
  try {
    ({ email } = await createServerORPCClient(undefined, await clientAddress())
      .auth.resolveSignInEmail({ identifier: input.data.identifier }));
  } catch (error) {
    // "Try again" is the exact wrong advice when the resolver has rate-limited
    // this address — twenty lookups per ten minutes — because trying again is
    // what extends the limit. An outage and a limit needed different sentences.
    return {
      message: t(
        toApiError(error).code === 'RATE_LIMITED'
          ? 'error.too_many_attempts'
          : 'error.sign_in_failed',
      ),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.data.password,
    ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}),
  });
  if (error) return { message: t(signInErrorKey(error.code)) };

  if (!data.session) {
    await supabase.auth.signOut();
    return { message: t('error.sign_in_failed') };
  }
  // Not blocking, for the reason signup does not block either: the lease is
  // the student inactivity policy, and `studentAuthenticated` asks for it only
  // from somebody who is already a student somewhere. Refusing the sign-in
  // turned a Redis outage into nobody being able to sign in at all — staff
  // included, who are not subject to the policy — and said only "Sign in could
  // not be completed", which points at the password.
  await beginStudentSession(data.session.access_token);
  if ((await cookies()).has('cove_invitation')) {
    redirect('/invite', RedirectType.replace);
  }
  redirect('/welcome', RedirectType.replace);
}

/**
 * One Supabase auth code, one sentence — the sign-in half of `signupErrorKey`.
 *
 * The uniform "username or password is incorrect" is deliberate for anything
 * that would reveal whether an account exists, and stays. These four do not
 * reveal that. A rate limit is a fact about the caller, not the account; the
 * other three are reached only by presenting correct credentials, so whoever
 * reads them already knows the account is there.
 *
 * Keeping them uniform was the expensive part. Somebody Supabase had briefly
 * rate-limited was told their password was wrong, so they typed it again —
 * which is the one action that extends the limit. A suspended member was told
 * the same thing, and went to reset a password that was never the problem.
 */
function signInErrorKey(
  code: string | undefined,
):
  | 'error.account_suspended'
  | 'error.captcha_failed'
  | 'error.credentials_rejected'
  | 'error.email_not_confirmed'
  | 'error.too_many_attempts' {
  switch (code) {
    case 'captcha_failed':
      return 'error.captcha_failed';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'error.too_many_attempts';
    case 'user_banned':
      return 'error.account_suspended';
    case 'email_not_confirmed':
      return 'error.email_not_confirmed';
    default:
      return 'error.credentials_rejected';
  }
}

export async function signupAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = signupSchema.safeParse({
    displayName: formData.get('displayName'),
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
    academyId: formData.get('academyId'),
  });
  const { t } = await getServerTranslation(['auth', 'validation']);
  if (!input.success) {
    const usernameFailed = input.error.issues.some(
      (issue) => issue.path[0] === 'username',
    );
    return {
      message: usernameFailed
        ? t('validation:username_invalid')
        : t('validation:signup_invalid'),
    };
  }

  const captcha = captchaInput(formData);
  if (!captcha.valid) return { message: t('error.captcha_failed') };

  // Advisory only — the unique index decides. Checking here is what keeps a
  // taken name from being discovered after the Supabase account already exists.
  try {
    const { available } = await createServerORPCClient(
      undefined,
      await clientAddress(),
    ).auth.checkUsernameAvailable({ username: input.data.username });
    if (!available) return { message: t('error.username_taken') };
  } catch (error) {
    // This endpoint allows thirty checks per address per ten minutes, which a
    // person testing a deployment from one office exhausts in an afternoon.
    // Reporting that as "unable to create the account" sent them looking for a
    // fault in the form, when the only cure was to wait.
    return {
      message: t(
        toApiError(error).code === 'RATE_LIMITED'
          ? 'error.too_many_attempts'
          : 'error.signup_unavailable',
      ),
    };
  }

  const supabase = await createClient();
  const hasInvitation = (await cookies()).has('cove_invitation');
  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: {
        full_name: input.data.displayName,
        username: input.data.username,
        ...(hasInvitation
          ? {}
          : { requested_academy_id: input.data.academyId }),
      },
      emailRedirectTo: `${publicConfig.siteUrl}/auth/callback`,
      ...(captcha.token ? { captchaToken: captcha.token } : {}),
    },
  });
  if (error) return { message: t(signupErrorKey(error.code)) };

  // Supabase answers a signup for an address that already exists with a decoy:
  // no error, a user-shaped object with no identities, and no session. The
  // point is to refuse to confirm that the address is registered. Read
  // literally it looked like success, so the form said "check your email" for
  // a message Supabase never sends — the failure the invited manager hit, and
  // the one that leaves somebody waiting on an inbox forever.
  // An *empty* identities array, not a missing one: absent means the response
  // did not carry them, and reading that as "already registered" would reject
  // a signup that worked.
  if (
    !data.session &&
    Array.isArray(data.user?.identities) &&
    data.user.identities.length === 0
  ) {
    return { message: t('error.email_taken') };
  }

  if (data.session) {
    // Deliberately not blocking. The Supabase account exists by now and cannot
    // be rolled back, so a failure here used to sign the person out and report
    // "unable to create the account" for an account that had just been created
    // — after which every retry answered "already registered" and the only way
    // back in was a password reset they had no reason to think they needed.
    //
    // Nothing is lost by continuing. The lease is the thirty-minute student
    // inactivity policy, `studentAuthenticated` only demands it of somebody who
    // is already a student somewhere, and a brand-new account is a student
    // nowhere until an invitation or an approval makes it one.
    await beginStudentSession(data.session.access_token);
    redirect(
      hasInvitation ? '/invite' : '/welcome',
      RedirectType.replace,
    );
  }

  return {
    success: true,
    message: t('error.signup_verify_email'),
  };
}

/**
 * One Supabase auth code, one sentence.
 *
 * Every one of these used to arrive as "Unable to create the account", which
 * is true and useless: an address already registered, a password the project's
 * policy rejects, and a provider refusing more mail need three different things
 * from the person reading them, and the shared sentence suggested none.
 */
function signupErrorKey(
  code: string | undefined,
):
  | 'error.captcha_failed'
  | 'error.email_taken'
  | 'error.password_weak'
  | 'error.signup_disabled'
  | 'error.signup_failed'
  | 'error.too_many_attempts' {
  switch (code) {
    case 'captcha_failed':
      return 'error.captcha_failed';
    case 'user_already_exists':
    case 'email_exists':
      return 'error.email_taken';
    case 'weak_password':
      return 'error.password_weak';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'error.signup_disabled';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'error.too_many_attempts';
    default:
      return 'error.signup_failed';
  }
}

export async function startSocialAuthAction(input: {
  provider: SocialAuthProvider;
  academyId?: string;
}): Promise<AuthFormState> {
  const { t } = await getServerTranslation(['auth', 'validation']);
  const parsed = socialAuthSchema.safeParse(input);
  if (!parsed.success) {
    return { message: t('validation:social_request_invalid') };
  }

  // Before the intent and before Supabase. A provider whose credentials this
  // deployment does not hold has no button, so reaching here means the request
  // was written by hand — and it must not leave an onboarding intent behind or
  // reach a provider whose consent screen would fail halfway through.
  if (!isSocialProviderAvailable(parsed.data.provider)) {
    return { message: t('error.social_unavailable') };
  }

  const cookieStore = await cookies();
  const hasInvitation = cookieStore.has('cove_invitation');
  if (hasInvitation || !parsed.data.academyId) {
    cookieStore.delete('cove_oauth_intent');
  } else {
    try {
      const intent = await createServerORPCClient(
        undefined,
        await clientAddress(),
      )
        .auth.createOAuthOnboardingIntent({
          academyId: parsed.data.academyId,
          provider: parsed.data.provider,
        });
      cookieStore.set('cove_oauth_intent', intent.token, {
        httpOnly: true,
        maxAge: 10 * 60,
        path: '/auth',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });
    } catch (error) {
      return {
        message: t(
          toApiError(error).code === 'RATE_LIMITED'
            ? 'error.too_many_attempts'
            : 'error.social_start_failed',
        ),
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider as Provider,
    options: {
      redirectTo: `${publicConfig.siteUrl}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    cookieStore.delete('cove_oauth_intent');
    return { message: t('error.social_unavailable') };
  }
  redirect(data.url, RedirectType.replace);
}

/**
 * Claims a username for an account that has none — one created before the
 * column existed, or one whose signup name was taken in the moment between the
 * availability check and the profile being written.
 */
export async function setUsernameAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = usernameSchema.safeParse(formData.get('username'));
  const { t } = await getServerTranslation(['auth', 'validation', 'errors']);
  if (!input.success) {
    return { message: t('validation:username_invalid') };
  }

  try {
    await createServerORPCClient().auth.setUsername({ username: input.data });
  } catch (error) {
    const { code } = toApiError(error);
    if (code === 'USERNAME_TAKEN') {
      return { message: t('errors:USERNAME_TAKEN') };
    }
    if (code === 'USERNAME_ALREADY_SET') {
      return { message: t('errors:USERNAME_ALREADY_SET') };
    }
    return { message: t('errors:UNKNOWN') };
  }

  redirect('/welcome');
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}


async function beginStudentSession(accessToken: string): Promise<boolean> {
  try {
    await createServerORPCClient(accessToken, await clientAddress())
      .studentSession.begin({});
    return true;
  } catch {
    return false;
  }
}
