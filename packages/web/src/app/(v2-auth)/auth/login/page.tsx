import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { LoginForm } from './_components/login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const query = await searchParams;
  const { t } = await getServerTranslation(['auth']);
  const initialError = query.error === 'identity-conflict'
    ? t('error.identity_conflict')
    : query.error
      ? t('error.sign_in_failed')
      : undefined;
  return (
    <AuthCard
      description={t('login.description')}
      title={t('login.title')}
    >
      <LoginForm
        initialError={initialError}
        passwordReset={query.reset === 'success'}
      />
    </AuthCard>
  );
}
