'use client';

import { useState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { logoutAction } from '../actions';
import { SignOutConfirmModal } from './sign-out-confirm-modal';

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
    setPending(true);
    await logoutAction();
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

      {open ? (
        <SignOutConfirmModal
          onCancel={() => setOpen(false)}
          onConfirm={confirmSignOut}
          pending={pending}
        />
      ) : null}
    </>
  );
}
