'use client';

import { useActionState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import {
  acceptInvitationAction,
  dismissInvitationAction,
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
        className="h-12 w-full rounded-xl bg-brand font-bold text-on-brand hover:bg-brand-deep disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? t('invitation.submitting') : t('invitation.submit')}
      </button>
      {/* The way out. This page is reached by having *seen* an invitation link,
          not by being the person invited, so it must never be a room with one
          door that only opens for somebody else. */}
      <button
        className="h-11 w-full rounded-xl border border-border font-semibold text-sub transition-colors hover:text-ink disabled:opacity-60"
        disabled={pending}
        formAction={dismissInvitationAction}
        type="submit"
      >
        {t('invitation.dismiss')}
      </button>
    </form>
  );
}
