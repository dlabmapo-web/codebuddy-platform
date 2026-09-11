import { notFound } from 'next/navigation';

import type { StudentRosterPage } from '@cove/shared';
import {
  parseStudentRosterQuery,
  serializeStudentRosterQuery,
} from '@cove/shared';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { peopleRosterNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageAcademy } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudentRoster } from './_components/student-roster';

/**
 * Every student in the academy, rendered on the server for the exact query the
 * URL asks for — so a shared link to "suspended students in 월수 파이썬" opens
 * on its rows rather than on a skeleton that then jumps.
 *
 * A failed read is left to the client, which retries and can say what
 * happened: an empty roster and an unreachable one look identical on the
 * server and must not on the screen.
 */
export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canManageAcademy(roles)) notFound();

  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['people-rosters']),
    initTranslations(locale, peopleRosterNamespaces),
  ]);

  const query = parseStudentRosterQuery(await searchParams);
  const page = await createServerORPCClient()
    .academyPeople.students({ academyId, ...query })
    .catch((): StudentRosterPage | null => null);

  return (
    <StudioPage
      description={t('students.description')}
      title={t('students.title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={peopleRosterNamespaces}
        resources={resources}
      >
        <StudentRoster
          academyId={academyId}
          initialData={page}
          initialKey={serializeStudentRosterQuery(query)}
        />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
