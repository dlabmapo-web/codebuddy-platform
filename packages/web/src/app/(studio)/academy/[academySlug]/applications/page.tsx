import { requireAcademyRoute } from '@/lib/academy-route';
import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioShell } from '../_components/studio-shell';
import { ApplicationsManager } from './_components/applications-manager';

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['applications']);
  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <ApplicationsManager academyId={academyId} />
    </StudioShell>
  );
}
