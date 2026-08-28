import { requireAcademyRoute } from '@/lib/academy-route';
import type { TeacherStudentList } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { teachingNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isExplicitAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { StudentAnalytics } from './_components/student-analytics';
import {
  parseStudentsQuery,
  serializeStudentsQuery,
} from './_lib/students-url';

/**
 * Student analytics for every class this teacher is assigned to.
 *
 * The first page is rendered on the server for whatever state the URL asks
 * for, so a link a colleague sent opens on its own rows rather than on a
 * loading table that then jumps.
 *
 * Denial and absence are the same answer: a teacher who runs no class must not
 * be able to tell that apart from a route that does not exist, so both land on
 * the not-found page. §5.2 — a Student or Manager reaching this path gets the
 * same answer, because the service refuses them and the refusal is a 404 here.
 *
 * The copy is mounted at this level rather than in the studio layout: it is a
 * large namespace used by one role on two routes, and every Manager and Student
 * loading a studio page would otherwise pay for it in their RSC payload.
 */
export default async function StudentAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const query = parseStudentsQuery(await searchParams);
  const locale = await getLocale();
  const [{ resources }, { t }] = await Promise.all([
    initTranslations(locale, teachingNamespaces),
    getServerTranslation(['academy']),
  ]);

  let list: TeacherStudentList | null = null;
  try {
    list = await createServerORPCClient().academyTeacherStudents.list({
      academyId,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      ...(query.moduleId ? { moduleId: query.moduleId } : {}),
      ...(query.lectureId ? { lectureId: query.lectureId } : {}),
      ...(query.problemId ? { problemId: query.problemId } : {}),
      ...(query.search.trim() ? { search: query.search.trim() } : {}),
      range: query.range,
      attention: query.attention,
      sort: query.sort,
      direction: query.direction,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    // Only an expected access answer is a 404. Transport, validation, and
    // server faults belong to the route error boundary and observability, and
    // the client retries with a message rather than an empty table.
    if (isExplicitAccessDeniedError(error)) notFound();
    list = null;
  }

  return (
    <StudioPage
      bleed
      description={t('student_analytics_description')}
      title={t('student_analytics_title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={teachingNamespaces}
        resources={resources}
      >
        <StudentAnalytics
          academyId={academyId}
          initialData={list}
          // The exact state the server rendered for. Anything else refetches
          // rather than showing one query's rows under another query's filters.
          initialKey={serializeStudentsQuery(query)}
        />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
