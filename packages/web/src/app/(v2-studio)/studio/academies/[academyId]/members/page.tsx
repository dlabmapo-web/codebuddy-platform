import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioShell } from '../_components/studio-shell';
import { MembersManager } from './_components/members-manager';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['members']);
  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <MembersManager academyId={academyId} />
    </StudioShell>
  );
}
