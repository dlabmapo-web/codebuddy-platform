'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { loginAction, type AuthFormState } from '../../actions';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <>
      <SocialLoginButtons />
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
      </div>
      <form action={action} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Email
          <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" name="email" required type="email" />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Password
          <input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" minLength={8} name="password" required type="password" />
        </label>
        {state.message ? <p className="text-sm text-red-600">{state.message}</p> : null}
        <button className="h-11 w-full rounded-lg bg-blue-700 text-sm font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">New to Cove? <Link className="font-medium text-blue-700" href="/auth/signup">Create an account</Link></p>
    </>
  );
}
