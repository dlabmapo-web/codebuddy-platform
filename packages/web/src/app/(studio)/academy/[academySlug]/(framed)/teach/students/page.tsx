import { requireAcademyRoute } from '@/lib/academy-route';
import type { TeacherRoster } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { teachingNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isExplicitAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { StudentRosterView } from './_components/student-roster-view';
import { parseStudentsQuery, serializeStudentsQuery } from './_lib/students-url';

/**
 * The teacher's own students: who they teach, and where each one stands.
 *
 * One read and one table. Student analytics is a separate route next door —
 * the two answer different questions, and making them two views of this path
 * meant neither could be the current rail entry, because a nav highlight is
 * decided on the path alone.
 *
 * Denial and absence are the same answer: a teacher who runs no class must not
 * be able to tell that apart from a route that does not exist, so both land on
 * the not-found page.
 *
 * The copy is mounted at this level rather than in the studio layout: it is a
 * large namespace used by one role, and every Manager and Student loading a
 * studio page would otherwise pay for it in their RSC payload.
 */
export default async function TeacherStudentsPage({
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

  let roster: TeacherRoster | null = null;
  try {
    roster = await createServerORPCClient().academyTeacherStudents.roster({
      academyId,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.search.trim() ? { search: query.search.trim() } : {}),
    });
  } catch (error) {
    if (isExplicitAccessDeniedError(error)) notFound();
    roster = null;
  }

  return (
    <StudioPage
      bleed
      description={t('roster_description')}
      title={t('roster_title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={teachingNamespaces}
        resources={resources}
      >
        <StudentRosterView
          academyId={academyId}
          academySlug={academySlug}
          initialData={roster}
          initialKey={serializeStudentsQuery(query)}
        />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
