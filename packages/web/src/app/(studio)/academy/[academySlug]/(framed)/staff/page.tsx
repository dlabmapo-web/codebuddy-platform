import { notFound } from 'next/navigation';

import type { StaffRosterPage } from '@cove/shared';
import { parseStaffRosterQuery, serializeStaffRosterQuery } from '@cove/shared';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { peopleRosterNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageAcademy } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StaffRoster } from './_components/staff-roster';

/**
 * Every teacher, team lead, and manager, rendered on the server for the query
 * the URL asks for. See the Students page for why a failed read is left to the
 * client rather than rendered as an empty roster.
 */
export default async function StaffPage({
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

  const query = parseStaffRosterQuery(await searchParams);
  const page = await createServerORPCClient()
    .academyPeople.staff({ academyId, ...query })
    .catch((): StaffRosterPage | null => null);

  return (
    <StudioPage description={t('staff.description')} title={t('staff.title')}>
      <PageTranslationsProvider
        locale={locale}
        namespaces={peopleRosterNamespaces}
        resources={resources}
      >
        <StaffRoster
          academyId={academyId}
          initialData={page}
          initialKey={serializeStaffRosterQuery(query)}
        />
      </PageTranslationsProvider>
    </StudioPage>
  );
}
