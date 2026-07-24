import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { SignupForm } from './_components/signup-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    invited?: string;
    academy?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const { t } = await getServerTranslation(['auth']);
  const socialError = query.error === 'academy-required'
    ? t('error.academy_required')
    : query.error === 'oauth'
      ? t('error.oauth_failed')
      : undefined;
  return (
    <AuthCard
      description={t('signup.description')}
      title={t('signup.title')}
    >
      <SignupForm
        invitedAcademyId={query.invited === '1' ? query.academy : undefined}
        socialError={socialError}
      />
    </AuthCard>
  );
}
