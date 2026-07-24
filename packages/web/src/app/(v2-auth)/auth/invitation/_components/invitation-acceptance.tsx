'use client';

import { useActionState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import {
  acceptInvitationAction,
  type InvitationActionState,
} from '../actions';

const initialState: InvitationActionState = {};

export function InvitationAcceptance() {
  const { t } = useLayoutTranslation('auth');
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-5">
      <p className="text-sm leading-6 text-sub">
        {t('invitation.explanation')}
      </p>
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <button
        className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? t('invitation.submitting') : t('invitation.submit')}
      </button>
    </form>
  );
}
