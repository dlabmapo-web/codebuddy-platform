'use client';

import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthSubmitButton } from '../../_components/submit-button';
import { useAuthSubmission } from '../../_lib/use-auth-submission';
import {
  acceptInvitationAction,
  dismissInvitationAction,
  type InvitationActionState,
} from '../actions';

const initialState: InvitationActionState = {};

export function InvitationAcceptance() {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );
  const submission = useAuthSubmission(state, pending);

  // The action reads the invitation from a cookie and takes no payload, so the
  // form's FormData is discarded rather than forwarded.
  function submit() {
    if (!submission.begin()) return;
    action();
  }

  return (
    <form action={submit} className="space-y-5">
      <p className="text-sm leading-6 text-sub">
        {t('invitation.explanation')}
      </p>
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <AuthSubmitButton
        busy={submission.busy}
        busyLabel={t('invitation.submitting')}
        size="md"
      >
        {t('invitation.submit')}
      </AuthSubmitButton>
      {/* The way out. This page is reached by having *seen* an invitation link,
          not by being the person invited, so it must never be a room with one
          door that only opens for somebody else. */}
      <button
        className="h-11 w-full rounded-xl border border-border font-semibold text-sub transition-colors hover:text-ink disabled:opacity-60"
        disabled={submission.busy}
        formAction={dismissInvitationAction}
        type="submit"
      >
        {t('invitation.dismiss')}
      </button>
    </form>
  );
}
