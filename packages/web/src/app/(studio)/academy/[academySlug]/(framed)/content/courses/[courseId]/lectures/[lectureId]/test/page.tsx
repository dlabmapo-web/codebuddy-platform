import { rolesHavePermission } from '@cove/shared';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { BackLink } from '@/components/studio/back-link';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { examNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { requireAcademyRoute } from '@/lib/academy-route';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { TestAuthoringPage } from './_components/test-authoring-page';

/** The staff test page (Elice admin elice/01–07). */
export default async function TestPage({
  params,
}: {
  params: Promise<{ academySlug: string; courseId: string; lectureId: string }>;
}) {
  const { academySlug, courseId, lectureId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!rolesHavePermission(roles, 'curriculum.manage')) notFound();
  let test;
  try {
    test = await createServerORPCClient().exam.staffTest({ academyId, courseId, lectureId });
  } catch (error) {
    if (toApiError(error).code === 'EXAM_NOT_FOUND') notFound();
    throw error;
  }
  const locale = await getLocale();
  const { t } = await getServerTranslation(['exam']);
  const namespaces = [...examNamespaces, 'common'] as const;
  const { resources } = await initTranslations(locale, namespaces);
  return (
    <PageTranslationsProvider locale={locale} namespaces={namespaces} resources={resources}>
      <StudioPage
        bleed
        back={<BackLink href={routes.academyLearnCourse(academySlug, courseId)} label={t('back')} />}
        showPageHeading={false}
        title={test.title}
      >
        <TestAuthoringPage academyId={academyId} initial={test} />
      </StudioPage>
    </PageTranslationsProvider>
  );
}
