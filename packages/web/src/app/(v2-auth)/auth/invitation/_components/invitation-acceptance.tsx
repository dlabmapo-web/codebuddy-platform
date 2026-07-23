'use client';

import { useActionState } from 'react';

import {
  acceptInvitationAction,
  type InvitationActionState,
} from '../actions';

const initialState: InvitationActionState = {};

export function InvitationAcceptance() {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-5">
      <p className="text-sm leading-6 text-sub">
        Accepting adds your verified account to the academy with the role selected by its manager.
      </p>
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <button
        className="h-12 w-full rounded-xl bg-brand font-bold text-white hover:bg-brand-deep disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Accepting…' : 'Accept invitation'}
      </button>
    </form>
  );
}
