'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import type { Provider } from '@supabase/supabase-js';
import {
  socialAuthProviderSchema,
  type SocialAuthProvider,
} from '@cove/shared';

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
  if (!input.success) return { message: 'Enter a valid email and password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) return { message: 'The email or password is incorrect.' };
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
  if (!input.success) {
    return { message: 'Use a valid email, name, and password of 8+ characters.' };
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
  if (error) return { message: 'Unable to create the account.' };
  if (data.session) {
    redirect(hasInvitation ? '/auth/invitation' : '/auth/welcome');
  }

  return {
    success: true,
    message: 'Check your email to verify your account, then sign in.',
  };
}

export async function startSocialAuthAction(input: {
  provider: SocialAuthProvider;
  academyId?: string;
}): Promise<AuthFormState> {
  const parsed = socialAuthSchema.safeParse(input);
  if (!parsed.success) {
    return { message: 'Choose a valid academy and social provider.' };
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
      return { message: 'Unable to start social signup. Try again.' };
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
    return { message: 'This sign-in provider is not available yet.' };
  }
  redirect(data.url);
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/auth/login');
}
