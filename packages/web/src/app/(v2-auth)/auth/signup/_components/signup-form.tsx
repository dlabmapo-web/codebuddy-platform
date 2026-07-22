'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signupAction, type AuthFormState } from '../../actions';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <>
      <SocialLoginButtons />
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div>
      <form action={action} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">Name<input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" name="displayName" required /></label>
        <label className="block text-sm font-medium text-slate-800">Email<input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" name="email" required type="email" /></label>
        <label className="block text-sm font-medium text-slate-800">Password<input className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3" minLength={8} name="password" required type="password" /></label>
        {state.message ? <p className={state.success ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{state.message}</p> : null}
        <button className="h-11 w-full rounded-lg bg-blue-700 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || state.success} type="submit">{pending ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-900">You do not choose a role during signup. An academy manager assigns your role when approving or inviting you.</p>
      <p className="mt-6 text-center text-sm text-slate-600">Already registered? <Link className="font-medium text-blue-700" href="/auth/login">Sign in</Link></p>
    </>
  );
}
