import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AcademyOverview } from './_components/academy-overview';
import { StudioShell } from './_components/studio-shell';

export default async function AcademyPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['academy']);
  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <AcademyOverview academyId={academyId} />
    </StudioShell>
  );
}
