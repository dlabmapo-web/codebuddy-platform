'use client';

import { Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { signupAction, type AuthFormState } from '../../actions';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <div>
      <SocialLoginButtons />

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-sub/70">or with email</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={action} className="space-y-5">
        <TextField autoComplete="name" icon={User} label="Name" name="displayName" placeholder="Your name" required />
        <TextField autoComplete="email" icon={Mail} label="Email" name="email" placeholder="you@example.com" required type="email" />
        <PasswordField autoComplete="new-password" hint="At least 8 characters." minLength={8} />

        {state.message ? (
          <p className={state.success ? 'text-[14px] text-success' : 'text-[14px] text-danger'}>{state.message}</p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending || state.success}
          type="submit"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="mt-5 flex gap-3 rounded-xl border border-border bg-canvas px-4 py-3.5 text-[14px] leading-6 text-sub">
        <svg aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" fill="currentColor" opacity="0.12" r="10" />
          <circle cx="12" cy="8" fill="currentColor" r="1.25" />
          <path d="M12 11.5v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
        <p>You don&apos;t pick a role here. An academy manager gives you your role when they approve or invite you.</p>
      </div>

      <p className="mt-6 text-center text-[15px] text-sub">
        Already have an account?{' '}
        <Link className="font-bold text-brand hover:text-brand-deep" href="/auth/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
