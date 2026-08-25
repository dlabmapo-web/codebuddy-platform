'use client';

import { Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PasswordField } from '../../_components/form-fields';
import { RecoverySteps } from '../../_components/recovery-steps';
import { passwordMinLength } from '../../_lib/password-reset';
import {
  resetPasswordAction,
  type PasswordResetState,
} from '../../auth/recovery/actions';

const initialState: PasswordResetState = { status: 'idle' };

export function ResetPasswordForm() {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(
    resetPasswordAction,
    initialState,
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const requirementsId = useId();

  const longEnough = password.length >= passwordMinLength;
  const matches = password.length > 0 && password === confirmation;

  // Focus follows the rejection: to the field that can fix it, or to the
  // summary when the answer is neither field's fault.
  useEffect(() => {
    if (state.status !== 'error') return;
    if (state.field === 'newPassword') newPasswordRef.current?.focus();
    else if (state.field === 'confirmation') confirmationRef.current?.focus();
    else summaryRef.current?.focus();
  }, [state]);

  if (state.status === 'unauthorized') {
    return (
      <div>
        <RecoverySteps current="password" />
        <p
          className="rounded-2xl border border-warning/25 bg-warning/10 p-5 text-[14px] leading-6 text-ink"
          role="alert"
        >
          {state.message}
        </p>
        <Link
          className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          href="/forgot-password"
        >
          {t('recovery.request_new_link')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <RecoverySteps current="password" />

      <form action={action} className="space-y-5">
        <PasswordField
          autoComplete="new-password"
          describedBy={requirementsId}
          inputRef={newPasswordRef}
          label={t('reset.new_password')}
          minLength={passwordMinLength}
          name="newPassword"
          onValueChange={setPassword}
        />

        <PasswordField
          autoComplete="new-password"
          describedBy={requirementsId}
          inputRef={confirmationRef}
          label={t('reset.confirm_password')}
          minLength={passwordMinLength}
          name="confirmation"
          onValueChange={setConfirmation}
        />

        <ul className="space-y-2 rounded-xl bg-surface p-4" id={requirementsId}>
          <Requirement met={longEnough} text={t('reset.rule_length', { min: passwordMinLength })} />
          <Requirement met={matches} text={t('reset.rule_match')} />
        </ul>

        {state.status === 'error' ? (
          <p
            className="text-[14px] text-danger"
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
          >
            {state.message}
          </p>
        ) : null}

        <button
          aria-busy={pending}
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? t('reset.submitting') : t('reset.submit')}
        </button>
      </form>

      <p className="mt-7 text-center text-[14px] text-sub">
        <Link className="font-semibold text-brand hover:text-brand-deep" href="/forgot-password">
          {t('recovery.request_new_link')}
        </Link>
      </p>
    </div>
  );
}

/**
 * A rule and whether it is met yet.
 *
 * The shape changes with the state as well as the colour — a filled check
 * against an open circle — so the list still reads for someone who cannot
 * tell the green from the grey.
 */
function Requirement({ met, text }: { met: boolean; text: string }) {
  const { t } = useTranslation('auth');
  return (
    <li className="flex items-center gap-2.5 text-[14px] leading-5">
      {met ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
          <Check aria-hidden size={13} strokeWidth={3.5} />
        </span>
      ) : (
        <Circle aria-hidden className="h-5 w-5 shrink-0 text-sub/45" size={20} strokeWidth={1.75} />
      )}
      <span className={met ? 'font-medium text-ink' : 'text-sub'}>{text}</span>
      <span className="sr-only">
        {met ? t('reset.rule_met') : t('reset.rule_unmet')}
      </span>
    </li>
  );
}
