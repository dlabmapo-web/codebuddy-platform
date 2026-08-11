'use client';

import { User } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { loginAction, type AuthFormState } from '../../actions';
import { AuthDivider } from '../../_components/auth-divider';
import { PasswordField, TextField } from '../../_components/form-fields';
import { SocialLoginButtons } from '../../_components/social-login-buttons';

const initialState: AuthFormState = {};

export function LoginForm({ initialError }: { initialError?: string }) {
  const { t } = useLayoutTranslation('auth');
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <div>
      <SocialLoginButtons />

      <AuthDivider label={t('divider.or_with_username')} />

      <form action={action} className="space-y-5">
        <TextField
          autoComplete="username"
          icon={User}
          label={t('field.username')}
          name="identifier"
          placeholder={t('field.username_placeholder')}
          required
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-ink">
              {t('field.password')}
            </span>
            <Link className="text-[14px] font-semibold text-brand hover:text-brand-deep" href="/auth/forgot">
              {t('login.forgot_password')}
            </Link>
          </div>
          <PasswordField label="" minLength={8} />
        </div>

        {state.message || initialError ? (
          <p className="text-[14px] text-danger">
            {state.message ?? initialError}
          </p>
        ) : null}

        <button
          className="h-14 w-full rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? t('login.submitting') : t('login.submit')}
        </button>
      </form>

      <p className="mt-7 text-center text-[15px] text-sub">
        {t('login.no_account')}{' '}
        <Link className="font-bold text-brand hover:text-brand-deep" href="/auth/signup">
          {t('login.create_account')}
        </Link>
      </p>
    </div>
  );
}
