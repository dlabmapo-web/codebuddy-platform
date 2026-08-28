import { requireAcademyRoute } from '@/lib/academy-route';
import { canReviewApplications } from '@/lib/academy-access-state';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ApplicationsManager } from './_components/applications-manager';

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId, role } = await requireAcademyRoute(academySlug);
  if (!canReviewApplications(role)) notFound();
  const { t } = await getServerTranslation(['applications']);
  return (
    <StudioPage title={t('title')}>
      <ApplicationsManager academyId={academyId} role={role} />
    </StudioPage>
  );
}
