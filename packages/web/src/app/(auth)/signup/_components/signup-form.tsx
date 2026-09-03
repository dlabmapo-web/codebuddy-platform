'use client';

import { AtSign, Mail, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SignupKind } from '@cove/shared';

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
import { AccountKindField } from './account-kind-field';
import { SignupNotice } from './signup-notice';
import { SocialNoAccountNotice } from './social-no-account-notice';

const initialState: AuthFormState = {};

export function SignupForm({
  invitedAcademy,
  invitedAcademyId,
  socialError,
  socialProvider,
  noAccount,
}: {
  /** As the invitation names it, whatever state the academy is in. */
  invitedAcademy?: { id: string; name: string } | null;
  invitedAcademyId?: string;
  socialError?: string;
  /** Named in the "you have no account yet" panel, when one is shown. */
  socialProvider?: string;
  noAccount?: boolean;
}) {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(signupAction, initialState);
  const academies = useSignupAcademies(invitedAcademyId, invitedAcademy);
  const [kind, setKind] = useState<SignupKind>('STUDENT');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  // Signup ends two ways. With email confirmation off it redirects, and the
  // form is replaced rather than answered; with it on it returns the "check
  // your email" notice. Only the second is an answer, and only the second
  // releases the button. A student signup only ever ends the first way — there
  // is no address to confirm.
  const submission = useAuthSubmission(state, pending);

  // Shown as soon as the second field has something in it, and never while it
  // is still empty: telling somebody their passwords do not match before they
  // have finished typing the second one is noise, not help.
  const mismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;

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
      {noAccount ? (
        <SocialNoAccountNotice provider={socialProvider} />
      ) : null}

      <AcademySelectorField
        academies={academies}
        socialError={socialError}
      />

      <form action={submit} className="space-y-4">
        <input
          name="academyId"
          type="hidden"
          value={academies.academyId}
        />
        {/* The kind travels as a hidden field rather than as two forms. The
            server re-derives everything from it, so a browser that never
            rendered the email input cannot be the reason it is missing. */}
        <input name="kind" type="hidden" value={kind} />

        <AccountKindField onChange={setKind} value={kind} />

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
        {/*
         * Only for staff, and unmounted rather than hidden for the rest. A
         * `display: none` input still submits, so a student who had toggled to
         * 교직원 and back would post an address the server would then hold them
         * to. Unmounting is what makes "a student has no email" true of the
         * request as well as of the screen.
         */}
        {kind === 'STAFF' ? (
          <TextField
            autoComplete="email"
            icon={Mail}
            label={t('field.email')}
            name="email"
            placeholder={t('field.email_placeholder')}
            required
            type="email"
          />
        ) : null}
        {/*
         * Side by side from `sm` up, and the one place on this form where two
         * columns encode something true rather than just saving a row: the
         * pair is one value typed twice, and seeing both at once is how a
         * person checks it. Stacked on a phone, where 240px columns would not
         * hold a password.
         */}
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField
            autoComplete="new-password"
            minLength={8}
            onValueChange={setPassword}
          />
          <PasswordField
            autoComplete="new-password"
            label={t('field.password_confirm')}
            minLength={8}
            name="passwordConfirm"
            onValueChange={setPasswordConfirm}
          />
        </div>
        {/*
         * Under the pair rather than under one half of it, because it is about
         * both. This field matters more here than on most forms: a student has
         * no address to send a reset to, so a password mistyped twice is an
         * account they cannot get back into until a manager issues a new one.
         */}
        <p
          aria-live="polite"
          className={`-mt-1 text-[13px] leading-5 ${
            mismatch ? 'text-danger' : 'text-sub'
          }`}
        >
          {mismatch
            ? t('signup.password_mismatch')
            : t('field.password_hint')}
        </p>

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
          disabled={block !== null || mismatch}
        >
          {t('signup.submit')}
        </AuthSubmitButton>
        {blockedHint ? (
          <p aria-live="polite" className="text-[13px] text-sub">
            {blockedHint}
          </p>
        ) : null}
      </form>

      {/*
       * Social sign-in makes an account from a provider's address, so it is
       * staff-shaped by construction. Offering it to somebody who has just
       * said they are a student would hand them the one signup path their
       * answer rules out.
       */}
      {kind === 'STAFF' ? (
        <>
          <AuthDivider label={t('divider.or_continue_with')} />
          <SocialLoginButtons
            academyRequired
            requestedAcademyId={academies.academyId}
          />
        </>
      ) : null}

      <SignupNotice />

      <p className="mt-5 text-center text-[14px] text-sub">
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
