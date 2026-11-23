import { rolesHavePermission } from '@cove/shared';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { ExamTeachTranslations } from '../_components/exam-teach-page';
import { TestResults } from '../_components/test-results';

/** One test's results for one class (Elice elice/23–24). One read on the server. */
export default async function ClassTestResultsPage({ params }: { params: Promise<{ academySlug: string; classId: string; lectureId: string }> }) {
  const { academySlug, classId, lectureId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['exam']);
  let results;
  try {
    results = await createServerORPCClient().exam.results({ academyId, classId, lectureId });
  } catch {
    notFound();
  }
  return (
    <ExamTeachTranslations>
      <StudioPage bleed title={results.title} description={results.className}
        back={<BackLink href={routes.academyTeachClassTests(academySlug, classId)} label={t('results.title')} />}>
        <TestResults academyId={academyId} initial={results} canManageContent={rolesHavePermission(roles, 'curriculum.manage')} />
      </StudioPage>
    </ExamTeachTranslations>
  );
}
