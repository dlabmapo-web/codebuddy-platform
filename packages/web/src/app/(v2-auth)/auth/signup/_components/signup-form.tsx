'use client';

import { ChevronsUpDown, Mail, School, User } from 'lucide-react';
import Link from 'next/link';
import { forwardRef, useActionState, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { signupAction, type AuthFormState } from '../../actions';
import {
  ResponsiveSelector,
  type SelectorItem,
  type TriggerProps,
} from '@/components/studio/selector';
import { orpc } from '@/lib/orpc';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

/** Matches the height and shape of the auth form's text fields. */
const AcademyTrigger = forwardRef<HTMLButtonElement, TriggerProps<SelectorItem>>(
  function AcademyTrigger({ className, selectedItem, ...props }, ref) {
    // Disabled with nothing chosen means the list is still being fetched.
    const placeholder =
      props.disabled && !selectedItem
        ? 'Loading academies…'
        : 'Choose your academy';
    return (
      <button
        aria-controls={undefined}
        aria-expanded={false}
        className={`flex h-14 w-full items-center gap-3 rounded-xl border border-border bg-white px-4 text-left text-[16px] text-ink outline-none transition-colors hover:border-brand/50 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ''}`}
        ref={ref}
        role="combobox"
        type="button"
        {...props}
      >
        <School className="size-5 shrink-0 text-sub" strokeWidth={1.75} />
        <span
          className={`min-w-0 flex-1 truncate ${selectedItem ? '' : 'text-sub/60'}`}
        >
          {selectedItem?.name ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sub" />
      </button>
    );
  },
);

export function SignupForm({
  invitedAcademyId,
  socialError,
}: {
  invitedAcademyId?: string;
  socialError?: string;
}) {
  const [state, action, pending] = useActionState(signupAction, initialState);
  const [academyId, setAcademyId] = useState(invitedAcademyId ?? '');
  const academies = useQuery({
    queryKey: ['academies', 'signup'],
    queryFn: () => orpc.academies.listForSignup({}),
    staleTime: 5 * 60_000,
  });

  return (
    <div>
      <div className="mb-5">
        <span className="mb-2 block text-[15px] font-semibold text-ink">
          Academy branch
        </span>
        <ResponsiveSelector
          disabled={
            academies.isPending || academies.isError || Boolean(invitedAcademyId)
          }
          drawerTitle="Choose your academy"
          list={academies.data?.academies ?? []}
          onSelect={(academy) => setAcademyId(academy.id)}
          placeholder="Search academies…"
          selectedId={academyId || null}
          TriggerComp={AcademyTrigger}
        />
        {academies.isError ? (
          <p className="mt-2 text-[14px] text-danger">Academies are unavailable right now. Try again shortly.</p>
        ) : null}
        {socialError ? (
          <p className="mt-2 text-[14px] text-danger">{socialError}</p>
        ) : null}
      </div>

      <form action={action} className="space-y-5">
        <input name="academyId" type="hidden" value={academyId} />
        <TextField autoComplete="name" icon={User} label="Name" name="displayName" placeholder="Your name" required />
        <TextField autoComplete="email" icon={Mail} label="Email" name="email" placeholder="you@example.com" required type="email" />
        <PasswordField autoComplete="new-password" hint="At least 8 characters." minLength={8} />

        {state.message ? (
          <p className={state.success ? 'text-[14px] text-success' : 'text-[14px] text-danger'}>{state.message}</p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending || state.success || !academyId}
          type="submit"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-sub/70">
          or continue with
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SocialLoginButtons
        academyRequired
        requestedAcademyId={academyId}
      />

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
