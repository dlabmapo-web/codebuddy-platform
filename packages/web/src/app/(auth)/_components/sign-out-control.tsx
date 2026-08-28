'use client';

import { useState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { logoutAction } from '../actions';
import { AuthBusyOverlay } from './busy-overlay';
import { SignOutConfirmModal } from './sign-out-confirm-modal';

/**
 * Signing out, from wherever it is offered — both sidebars, the welcome
 * screen, and the pending-approval screen.
 *
 * Confirmed first, because it is not a small thing to do by accident on a
 * shared classroom machine, and then held: the same page-level wash the
 * sign-in form uses covers the screen until the login page replaces it.
 *
 * The wash replaces the dialog rather than sitting on top of it. Both are
 * fixed layers at the same depth and the dialog is portalled, so it would win
 * the stacking contest and leave a spinner hidden behind a modal nobody can
 * dismiss. Closing it is also the truer reading: the question has been
 * answered, and what is on screen now is the answer being carried out.
 *
 * `logoutAction` redirects, so the promise never resolves normally and the
 * busy state simply ends with the document. A rejection is the one case that
 * has to be handled: a sign-out that could not reach the server leaves the
 * reader signed in, so the dialog comes back and they can try again rather
 * than sitting under a spinner that will never finish.
 */
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirmSignOut() {
    // The dialog's confirm stays reachable while it works, so a second press
    // is possible and is refused here rather than by disabling the control
    // under the reader's cursor.
    if (pending) return;
    setPending(true);
    try {
      await logoutAction();
    } catch {
      setPending(false);
    }
  }

  return (
    <>
      <div className={formClassName}>
        <button
          className={className}
          onClick={() => setOpen(true)}
          type="button"
        >
          {label ?? t('action.sign_out')}
        </button>
      </div>

      {open && !pending ? (
        <SignOutConfirmModal
          onCancel={() => setOpen(false)}
          onConfirm={confirmSignOut}
        />
      ) : null}

      {pending ? (
        <AuthBusyOverlay label={t('sign_out_confirm.confirming')} />
      ) : null}
    </>
  );
}
