'use client';

import { unstable_rethrow } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { logoutAction } from '../actions';
import { AuthBusyOverlay } from './busy-overlay';

/** Shared by profile menus and the standalone welcome/pending screens. */
export function useSignOut() {
  const { t } = useLayoutTranslation('common');
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    startTransition(async () => {
      try {
        await logoutAction();
      } catch (error) {
        unstable_rethrow(error);
        inFlight.current = false;
        setPending(false);
        setFailed(true);
      }
    });
  }

  return {
    signOut,
    pending,
    feedback: pending ? (
      <AuthBusyOverlay label={t('sign_out_confirm.confirming')} />
    ) : failed ? (
      <p className="text-sm text-danger" role="alert">{t('sign_out_failed')}</p>
    ) : null,
  };
}

export function SignOutControl({
  className = 'text-sm font-semibold text-sub hover:text-ink',
  formClassName,
  label,
}: {
  className?: string;
  formClassName?: string;
  label?: React.ReactNode;
}) {
  const { t } = useLayoutTranslation('common');
  const { signOut, pending, feedback } = useSignOut();

  return (
    <>
      <div className={formClassName}>
        <button
          aria-busy={pending}
          className={className}
          disabled={pending}
          onClick={signOut}
          type="button"
        >
          {label ?? t('action.sign_out')}
        </button>
      </div>
      {feedback}
    </>
  );
}
