'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import type { Provider } from '@supabase/supabase-js';
import {
  socialAuthProviderSchema,
  type SocialAuthProvider,
} from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { publicConfig } from '@/lib/config';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';

export type AuthFormState = { message?: string; success?: boolean };

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const signupSchema = credentialsSchema.extend({
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
    email: formData.get('email'),
    password: formData.get('password'),
  });
  const { t } = await getServerTranslation(['auth', 'validation']);
  if (!input.success) {
    return { message: t('validation:credentials_invalid') };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) return { message: t('error.credentials_rejected') };
  if ((await cookies()).has('cove_invitation')) redirect('/auth/invitation');
  redirect('/auth/welcome');
}

export async function signupAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = signupSchema.safeParse({
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    password: formData.get('password'),
    academyId: formData.get('academyId'),
  });
  const { t } = await getServerTranslation(['auth', 'validation']);
  if (!input.success) {
    return { message: t('validation:signup_invalid') };
  }

  const supabase = await createClient();
  const hasInvitation = (await cookies()).has('cove_invitation');
  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: {
        full_name: input.data.displayName,
        ...(hasInvitation
          ? {}
          : { requested_academy_id: input.data.academyId }),
      },
      emailRedirectTo: `${publicConfig.siteUrl}/auth/callback`,
    },
  });
  if (error) return { message: t('error.signup_failed') };
  if (data.session) {
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

  const cookieStore = await cookies();
  const hasInvitation = cookieStore.has('cove_invitation');
  if (hasInvitation || !parsed.data.academyId) {
    cookieStore.delete('cove_oauth_intent');
  } else {
    try {
      const requestHeaders = await headers();
      const forwardedClientAddress = requestHeaders.get('x-forwarded-for')
        ?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || undefined;
      const intent = await createServerORPCClient(
        undefined,
        forwardedClientAddress,
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

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth/login');
}
