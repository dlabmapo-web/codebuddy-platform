'use client';

import { CircleCheck, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { publicConfig } from '@/lib/config';

import { loginAction, type AuthFormState } from '../../actions';
import { AuthDivider } from '../../_components/auth-divider';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';
import { TurnstileChallenge } from '../../_components/turnstile-challenge';

const initialState: AuthFormState = {};

export function LoginForm({
  initialError,
  passwordReset = false,
}: {
  initialError?: string;
  /** Arrived here from a completed password reset, which requires a fresh sign-in. */
  passwordReset?: boolean;
}) {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);

  function submit(formData: FormData) {
    setCaptchaToken(null);
    setChallengeKey((current) => current + 1);
    action(formData);
  }

  return (
    <div>
      {passwordReset ? (
        <div
          className="mb-6 flex gap-3.5 rounded-2xl border border-success/25 bg-success/10 p-5"
          role="status"
        >
          <CircleCheck aria-hidden className="mt-0.5 shrink-0 text-success" size={22} strokeWidth={2} />
          <div>
            <p className="text-[15px] font-bold text-ink">
              {t('login.reset_success_title')}
            </p>
            <p className="mt-1 text-[14px] leading-6 text-sub">
              {t('login.reset_success_body')}
            </p>
          </div>
        </div>
      ) : null}

      <SocialLoginButtons />

      <AuthDivider label={t('divider.or_with_username')} />

      <form action={submit} className="space-y-5">
        <TextField
          autoComplete="username"
          icon={User}
          label={t('field.username')}
          name="identifier"
          placeholder={t('field.username_placeholder')}
          required
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">
              {t('field.password')}
            </span>
            <Link className="text-[14px] font-semibold text-brand hover:text-brand-deep" href="/auth/forgot">
              {t('login.forgot_password')}
            </Link>
          </div>
          <PasswordField label="" minLength={8} />
        </div>

        {publicConfig.turnstileSiteKey ? (
          <>
            <input
              name="captchaToken"
              type="hidden"
              value={captchaToken ?? ''}
            />
            <TurnstileChallenge
              action="login"
              key={challengeKey}
              onTokenChange={setCaptchaToken}
              siteKey={publicConfig.turnstileSiteKey}
            />
          </>
        ) : null}

        {state.message || initialError ? (
          <p className="text-[14px] text-danger" role="alert">
            {state.message ?? initialError}
          </p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={
            pending || Boolean(publicConfig.turnstileSiteKey && !captchaToken)
          }
          type="submit"
        >
          {pending ? t('login.submitting') : t('login.submit')}
        </button>
      </form>

      <p className="mt-7 text-center text-[15px] text-sub">
        {t('login.no_account')}{' '}
        <Link className="font-bold text-brand hover:text-brand-deep" href="/auth/signup">
          {t('login.create_account')}
        </Link>
      </p>
    </div>
  );
}
