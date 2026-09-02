'use client';

import { AtSign, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { publicConfig } from '@/lib/config';

import { signupAction, type AuthFormState } from '../../actions';
import { AuthDivider } from '../../_components/auth-divider';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';
import { AuthSubmitButton } from '../../_components/submit-button';
import { TurnstileChallenge } from '../../_components/turnstile-challenge';
import { signupSubmitBlock } from '../../_lib/submit-block';
import { useAuthSubmission } from '../../_lib/use-auth-submission';
import { useSignupAcademies } from '../_hooks/use-signup-academies';
import { AcademySelectorField } from './academy-selector-field';
import { SignupNotice } from './signup-notice';

const initialState: AuthFormState = {};

export function SignupForm({
  invitedAcademy,
  invitedAcademyId,
  socialError,
}: {
  /** As the invitation names it, whatever state the academy is in. */
  invitedAcademy?: { id: string; name: string } | null;
  invitedAcademyId?: string;
  socialError?: string;
}) {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(signupAction, initialState);
  const academies = useSignupAcademies(invitedAcademyId, invitedAcademy);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  // Signup ends two ways. With email confirmation off it redirects, and the
  // form is replaced rather than answered; with it on it returns the "check
  // your email" notice. Only the second is an answer, and only the second
  // releases the button.
  const submission = useAuthSubmission(state, pending);

  // Three independent reasons used to collapse into one dead button, and a
  // person looking at it could not tell whether they were waiting on the
  // security check or had simply not picked an academy yet. The button still
  // refuses; it just says which of them it is waiting for. A spent form gets
  // no hint — the message above it already is one.
  const block = signupSubmitBlock({
    succeeded: Boolean(state.success),
    academyId: academies.academyId,
    captchaRequired: Boolean(publicConfig.turnstileSiteKey),
    captchaToken,
  });
  const blockedHint = block === 'academy_missing'
    ? t('signup.choose_academy_first')
    : block === 'captcha_pending'
      ? t('captcha.pending')
      : null;

  function submit(formData: FormData) {
    if (!submission.begin()) return;
    setCaptchaToken(null);
    setChallengeKey((current) => current + 1);
    action(formData);
  }

  return (
    <div>
      <AcademySelectorField
        academies={academies}
        socialError={socialError}
      />

      <form action={submit} className="space-y-5">
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

        {publicConfig.turnstileSiteKey ? (
          <>
            <input
              name="captchaToken"
              type="hidden"
              value={captchaToken ?? ''}
            />
            <TurnstileChallenge
              action="signup"
              key={challengeKey}
              onTokenChange={setCaptchaToken}
              siteKey={publicConfig.turnstileSiteKey}
            />
          </>
        ) : null}

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

        <AuthSubmitButton
          busy={submission.busy}
          busyLabel={t('signup.submitting')}
          disabled={block !== null}
        >
          {t('signup.submit')}
        </AuthSubmitButton>
        {blockedHint ? (
          <p aria-live="polite" className="text-[13px] text-sub">
            {blockedHint}
          </p>
        ) : null}
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
          href="/login"
        >
          {t('signup.sign_in')}
        </Link>
      </p>
    </div>
  );
}
