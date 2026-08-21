'use client';

import { ArrowLeft, MailCheck, User } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { publicConfig } from '@/lib/config';

import { TextField } from '../../_components/form-fields';
import { RecoverySteps } from '../../_components/recovery-steps';
import { TurnstileChallenge } from '../../_components/turnstile-challenge';
import {
  requestPasswordRecoveryAction,
  type RecoveryRequestState,
} from '../../recovery/actions';

const initialState: RecoveryRequestState = { status: 'idle' };

/**
 * How long the resend control stays quiet.
 *
 * Client-side and advisory. It exists so a second click while the first email
 * is still in flight does not read as a broken button; the limits that
 * actually matter live in the API and in Supabase, where a reload cannot
 * clear them.
 */
const resendCooldownSeconds = 60;

const submitButton =
  'h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50';

export function ForgotPasswordForm({ linkExpired }: { linkExpired?: boolean }) {
  const { t } = useTranslation('auth');
  const [state, dispatch, pending] = useActionState(
    requestPasswordRecoveryAction,
    initialState,
  );
  const [username, setUsername] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [challengeKey, setChallengeKey] = useState(0);
  const usernameRef = useRef<HTMLInputElement>(null);
  const accepted = state.status === 'accepted';

  function submit(formData: FormData) {
    setUsername(String(formData.get('username') ?? ''));
    // Counted from the request, not from the answer: what it throttles is how
    // often somebody asks, and the page always answers the same way.
    setCooldown(resendCooldownSeconds);
    // The FormData already contains this challenge's token. Replace the widget
    // immediately so a resend cannot reuse a single-use response.
    setCaptchaToken(null);
    setChallengeKey((current) => current + 1);
    dispatch(formData);
  }

  // A rejected format is the only thing this form can be wrong about, so
  // there is exactly one field to send the person back to.
  useEffect(() => {
    if (state.status === 'invalid') usernameRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <div>
      <RecoverySteps current={accepted ? 'email' : 'username'} />

      {linkExpired && !accepted ? (
        <p
          className="mb-6 flex gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4 text-[14px] leading-6 text-danger"
          role="alert"
        >
          {t('recovery.link_invalid')}
        </p>
      ) : null}

      <form action={submit} className="space-y-5">
        {publicConfig.turnstileSiteKey ? (
          <>
            <input
              name="captchaToken"
              type="hidden"
              value={captchaToken ?? ''}
            />
            <TurnstileChallenge
              action="password_recovery"
              key={challengeKey}
              onTokenChange={setCaptchaToken}
              siteKey={publicConfig.turnstileSiteKey}
            />
          </>
        ) : null}

        {accepted ? (
          <input name="username" type="hidden" value={username} />
        ) : (
          <>
            <TextField
              autoComplete="username"
              hint={t('forgot.username_hint')}
              icon={User}
              inputRef={usernameRef}
              label={t('field.username')}
              name="username"
              placeholder={t('field.username_placeholder')}
              required
            />

            {state.status === 'invalid' ? (
              <p className="text-[14px] text-danger" role="alert">
                {state.message}
              </p>
            ) : null}

            <button
              aria-busy={pending}
              className={submitButton}
              disabled={
                pending ||
                Boolean(publicConfig.turnstileSiteKey && !captchaToken)
              }
              type="submit"
            >
              {pending ? t('forgot.submitting') : t('forgot.submit')}
            </button>
          </>
        )}

        {accepted ? (
          <div>
            {/* The live region is the message alone. A countdown inside it
                would re-announce the whole panel every second, and would make
                the accepted state differ between two identical requests. */}
            <div
              aria-live="polite"
              className="rounded-2xl border border-success/25 bg-success/10 p-5"
              role="status"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
                  <MailCheck aria-hidden size={20} strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[15px] font-bold text-ink">
                    {t('forgot.accepted_title')}
                  </p>
                  <p className="mt-1.5 text-[14px] leading-6 text-sub">
                    {t('forgot.accepted_body')}
                  </p>
                </div>
              </div>
              <p className="mt-4 border-t border-success/20 pt-4 text-[13px] leading-5 text-sub">
                {t('forgot.accepted_hint')}
              </p>
            </div>

            <button
              aria-busy={pending}
              className="mt-6 text-[15px] font-bold text-brand transition-colors hover:text-brand-deep disabled:text-sub/70"
              disabled={
                pending ||
                cooldown > 0 ||
                Boolean(publicConfig.turnstileSiteKey && !captchaToken)
              }
              type="submit"
            >
              {cooldown > 0
                ? t('forgot.resend_in', { seconds: cooldown })
                : pending
                  ? t('forgot.submitting')
                  : t('forgot.resend')}
            </button>
          </div>
        ) : null}
      </form>

      <p className="mt-8 border-t border-border pt-6">
        <Link
          className="inline-flex items-center gap-2 text-[15px] font-semibold text-sub transition-colors hover:text-ink"
          href="/auth/login"
        >
          <ArrowLeft aria-hidden size={18} strokeWidth={2} />
          {t('forgot.back_to_login')}
        </Link>
      </p>
    </div>
  );
}
