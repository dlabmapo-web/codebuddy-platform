'use server';

import { redirect } from 'next/navigation';
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
  } catch {
    return { message: t('error.sign_in_failed') };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.data.password,
    ...(captcha.token ? { options: { captchaToken: captcha.token } } : {}),
  });
  if (error) {
    return {
      message: t(
        error.code === 'captcha_failed'
          ? 'error.captcha_failed'
          : 'error.credentials_rejected',
      ),
    };
  }
  if (!data.session || !(await beginStudentSession(data.session.access_token))) {
    await supabase.auth.signOut();
    return { message: t('error.sign_in_failed') };
  }
  if ((await cookies()).has('cove_invitation')) redirect('/auth/invitation');
  redirect('/auth/welcome');
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
  } catch {
    return { message: t('error.signup_failed') };
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
  if (error) {
    return {
      message: t(
        error.code === 'captcha_failed'
          ? 'error.captcha_failed'
          : 'error.signup_failed',
      ),
    };
  }
  if (data.session) {
    if (!(await beginStudentSession(data.session.access_token))) {
      await supabase.auth.signOut();
      return { message: t('error.signup_failed') };
    }
    redirect(hasInvitation ? '/auth/invitation' : '/auth/welcome');
  }

  return {
    success: true,
    message: t('error.signup_verify_email'),
  };
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
    } catch {
      return { message: t('error.social_start_failed') };
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
  redirect(data.url);
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

  redirect('/auth/welcome');
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth/login');
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
