'use client';

import { AtSign, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { signupAction, type AuthFormState } from '../../actions';
import { AuthDivider } from '../../_components/auth-divider';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';
import { useSignupAcademies } from '../_hooks/use-signup-academies';
import { AcademySelectorField } from './academy-selector-field';
import { SignupNotice } from './signup-notice';

const initialState: AuthFormState = {};

export function SignupForm({
  invitedAcademyId,
  socialError,
}: {
  invitedAcademyId?: string;
  socialError?: string;
}) {
  const { t } = useLayoutTranslation('auth');
  const [state, action, pending] = useActionState(signupAction, initialState);
  const academies = useSignupAcademies(invitedAcademyId);

  return (
    <div>
      <AcademySelectorField
        academies={academies}
        socialError={socialError}
      />

      <form action={action} className="space-y-5">
        <input
          name="academyId"
          type="hidden"
          value={academies.academyId}
        />
        <TextField
          autoComplete="name"
          icon={User}
          label={t('field.name')}
          name="displayName"
          placeholder={t('field.name_placeholder')}
          required
        />
        <TextField
          autoComplete="username"
          hint={t('field.username_hint')}
          icon={AtSign}
          label={t('field.username')}
          name="username"
          placeholder={t('field.username_placeholder')}
          required
        />
        <TextField
          autoComplete="email"
          icon={Mail}
          label={t('field.email')}
          name="email"
          placeholder={t('field.email_placeholder')}
          required
          type="email"
        />
        <PasswordField
          autoComplete="new-password"
          hint={t('field.password_hint')}
          minLength={8}
        />

        {state.message ? (
          <p
            className={
              state.success
                ? 'text-[14px] text-success'
                : 'text-[14px] text-danger'
            }
          >
            {state.message}
          </p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-white transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending || state.success || !academies.academyId}
          type="submit"
        >
          {pending ? t('signup.submitting') : t('signup.submit')}
        </button>
      </form>

      <AuthDivider label={t('divider.or_continue_with')} />

      <SocialLoginButtons
        academyRequired
        requestedAcademyId={academies.academyId}
      />

      <SignupNotice />

      <p className="mt-6 text-center text-[15px] text-sub">
        {t('signup.have_account')}{' '}
        <Link
          className="font-bold text-brand hover:text-brand-deep"
          href="/auth/login"
        >
          {t('signup.sign_in')}
        </Link>
      </p>
    </div>
  );
}
