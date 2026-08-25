'use client';

import { AtSign } from 'lucide-react';
import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';

import { setUsernameAction, type AuthFormState } from '../actions';
import { TextField } from './form-fields';

const initialState: AuthFormState = {};

/**
 * Shown to an account that reached the welcome screen without a username —
 * one created before the column existed, or one whose signup name was claimed
 * by somebody else in the moment between the availability check and the
 * profile being written. Until it is filled in, that person signs in with
 * their email.
 */
export function UsernameClaim() {
  const { t } = useTranslation('auth');
  const [state, action, pending] = useActionState(
    setUsernameAction,
    initialState,
  );

  return (
    <div className="rounded-xl border border-border p-5">
      <h2 className="text-[17px] font-bold text-ink">
        {t('welcome.choose_username_title')}
      </h2>
      <p className="mt-1 text-sm leading-6 text-sub">
        {t('welcome.choose_username_description')}
      </p>

      <form action={action} className="mt-4 space-y-4">
        <TextField
          autoComplete="username"
          hint={t('field.username_hint')}
          icon={AtSign}
          label={t('field.username')}
          name="username"
          placeholder={t('field.username_placeholder')}
          required
        />

        {state.message ? (
          <p className="text-[14px] text-danger">{state.message}</p>
        ) : null}

        <button
          className="h-12 w-full rounded-xl bg-brand text-[16px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending
            ? t('welcome.choose_username_submitting')
            : t('welcome.choose_username_submit')}
        </button>
      </form>
    </div>
  );
}
