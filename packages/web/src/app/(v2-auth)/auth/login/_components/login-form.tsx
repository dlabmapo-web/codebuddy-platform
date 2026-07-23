'use client';

import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { loginAction, type AuthFormState } from '../../actions';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <div>
      <SocialLoginButtons />

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-sub/70">or with email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} className="space-y-5">
        <TextField autoComplete="email" icon={Mail} label="Email" name="email" placeholder="you@example.com" required type="email" />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">Password</span>
            <Link className="text-[14px] font-semibold text-brand hover:text-brand-deep" href="/auth/forgot">
              Forgot password?
            </Link>
          </div>
          <PasswordField label="" minLength={8} />
        </div>

        {state.message || initialError ? (
          <p className="text-[14px] text-danger">
            {state.message ?? initialError}
          </p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-7 text-center text-[15px] text-sub">
        New to Cove Studio?{' '}
        <Link className="font-bold text-brand hover:text-brand-deep" href="/auth/signup">
          Create an account
        </Link>
      </p>
    </div>
  );
}
