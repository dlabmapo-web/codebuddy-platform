import { dlabEnabled } from '@/lib/dlab-sso';

import { redirect, RedirectType } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { currentAccountDestination } from '../_lib/signed-out-only';
import { LoginForm } from './_components/login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; signup?: string }>;
}) {
  const destination = await currentAccountDestination();
  if (destination) {
    redirect(destination, RedirectType.replace);
  }

  const query = await searchParams;
  const { t } = await getServerTranslation(['auth']);
  const initialError = query.error === 'identity-conflict'
    ? t('error.identity_conflict')
    : query.error
      ? t('error.sign_in_failed')
      : undefined;
  return (
    <AuthCard
      title={t('login.title')}
    >
      {dlabEnabled() && <a href="/sso/start" className="mb-5 flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">{t('dlab.login')}</a>}
      <LoginForm
        initialError={initialError}
        signupComplete={query.signup === 'success'}
        passwordReset={query.reset === 'success'}
      />
    </AuthCard>
  );
}
