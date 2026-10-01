import { requireAcademyRoute } from '@/lib/academy-route';
import { canReviewApplications } from '@/lib/academy-access-state';
import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ApplicationsManager } from './_components/applications-manager';

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId, role, roles } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['applications']);
  return (
    <StudioPage title={t('title')}>
      {canReviewApplications(roles) ? (
        <ApplicationsManager academyId={academyId} role={role} />
      ) : (
        <p role="alert" className="rounded-lg border border-border bg-card p-5 text-sub">
          {t('forbidden')}
        </p>
      )}
    </StudioPage>
  );
}
