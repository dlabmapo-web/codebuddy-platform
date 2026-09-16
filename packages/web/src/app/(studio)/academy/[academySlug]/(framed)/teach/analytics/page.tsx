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
import { StudentAnalytics } from '../students/_components/student-analytics';
import { parseStudentsQuery, serializeStudentsQuery } from '../students/_lib/students-url';

/**
 * Student analytics for every class this teacher is assigned to.
 *
 * Its own route, beside the students list rather than inside it. The two ask
 * different questions — "who needs me this week", measured over a period and
 * narrowed by a lecture, against "who do I teach and where do they stand" —
 * and they were previously two views of one path. That cost them both a nav
 * highlight, because which rail entry is current is decided on the path alone
 * and one path cannot be two entries.
 *
 * The components stay where they were. A route is a URL and a read; the table
 * behind it does not move house to get one.
 *
 * Denial and absence are the same answer: a teacher who runs no class must not
 * be able to tell that apart from a route that does not exist, so both land on
 * the not-found page.
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
