import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { InvitationAcceptance } from './_components/invitation-acceptance';

export default async function InvitationPage() {
  const { t } = await getServerTranslation(['auth']);
  return (
    <AuthCard
      description={t('invitation.description')}
      title={t('invitation.title')}
    >
      <InvitationAcceptance />
    </AuthCard>
  );
}
