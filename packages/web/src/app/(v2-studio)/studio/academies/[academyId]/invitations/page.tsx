import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioShell } from '../_components/studio-shell';
import { InvitationsManager } from './_components/invitations-manager';

export default async function InvitationsPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['invitations']);
  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <InvitationsManager academyId={academyId} />
    </StudioShell>
  );
}
