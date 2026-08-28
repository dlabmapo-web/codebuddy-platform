'use client';

import { AtSign } from 'lucide-react';
import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';

import { setUsernameAction, type AuthFormState } from '../actions';
import { TextField } from './form-fields';
import { AuthSubmitButton } from './submit-button';
import { useAuthSubmission } from '../_lib/use-auth-submission';

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
  const submission = useAuthSubmission(state, pending);

  function submit(formData: FormData) {
    if (!submission.begin()) return;
    action(formData);
  }

  return (
    <div className="rounded-xl border border-border p-5">
      <h2 className="text-[17px] font-bold text-ink">
        {t('welcome.choose_username_title')}
      </h2>
      <p className="mt-1 text-sm leading-6 text-sub">
        {t('welcome.choose_username_description')}
      </p>

      <form action={submit} className="mt-4 space-y-4">
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

        <AuthSubmitButton
          busy={submission.busy}
          busyLabel={t('welcome.choose_username_submitting')}
          size="md"
        >
          {t('welcome.choose_username_submit')}
        </AuthSubmitButton>
      </form>
    </div>
  );
}
