import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { ForgotPasswordForm } from './_components/forgot-password-form';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const { t } = await getServerTranslation(['auth']);

  return (
    <AuthCard
      description={t('forgot.description')}
      title={t('forgot.title')}
    >
      <ForgotPasswordForm linkExpired={query.error === 'invalid-link'} />
    </AuthCard>
  );
}
