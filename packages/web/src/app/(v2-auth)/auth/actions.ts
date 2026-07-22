'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

export type AuthFormState = { message?: string; success?: boolean };

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const signupSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(2).max(100),
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
  });
  if (!input.success) {
    return { message: 'Use a valid email, name, and password of 8+ characters.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: { full_name: input.data.displayName },
      emailRedirectTo: `${publicConfig.siteUrl}/auth/callback`,
    },
  });
  if (error) return { message: 'Unable to create the account.' };
  if (data.session) redirect('/auth/welcome');

  return {
    success: true,
    message: 'Check your email to verify your account, then sign in.',
  };
}
