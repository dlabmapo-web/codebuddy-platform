import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { ClassTestList } from './_components/class-test-list';
import { ExamTeachTranslations } from './_components/exam-teach-page';

/** The tests a class sits, with their period and how many have taken them. */
export default async function ClassTestsPage({ params }: { params: Promise<{ academySlug: string; classId: string }> }) {
  const { academySlug, classId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['exam']);
  let tests;
  try {
    ({ tests } = await createServerORPCClient().exam.classTests({ academyId, classId }));
  } catch {
    notFound();
  }
  return (
    <ExamTeachTranslations>
      <StudioPage title={t('results.title')} back={<BackLink href={routes.academyTeachClass(academySlug, classId)} label={t('back')} />}>
        <ClassTestList classId={classId} tests={tests} />
      </StudioPage>
    </ExamTeachTranslations>
  );
}
