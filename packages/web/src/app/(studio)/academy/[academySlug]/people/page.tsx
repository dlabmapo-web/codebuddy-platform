import { requireAcademyRoute } from '@/lib/academy-route';
import type { PeoplePage } from '@cove/shared';
import { parsePeopleQuery, serializePeopleQuery } from '@cove/shared';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { peopleOpsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../_components/studio-shell';
import { PeopleDirectory } from './_components/people-directory';

/**
 * The academy's people, rendered on the server for the exact query the URL
 * asks for.
 *
 * Server-rendered so a shared link — "suspended teachers, sorted by join date"
 * — opens on its rows rather than on a skeleton that then jumps. The client
 * owns the same query and refetches for any other state, so a stale bookmark
 * never shows one filter's rows under another filter's chips.
 *
 * A failure here is left to the client, which retries and can say what
 * happened. An empty directory and an unreachable one look identical on the
 * server and must not on the screen.
 */
export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['manager']),
    initTranslations(locale, peopleOpsNamespaces),
  ]);

  const query = parsePeopleQuery(await searchParams);

  const client = createServerORPCClient();

  // Both reads are attempted, and neither failing stops the page. The directory
  // renders its own error with a retry; an unreadable class list only means the
  // bulk enrolment picker is empty, which is a smaller failure than a blank
  // page and not one worth propagating.
  const [page, classes] = await Promise.all([
    client.academyPeople
      .list({ academyId, ...query })
      .catch((): PeoplePage | null => null),
    client.academyClasses
      .list({ academyId, status: 'ACTIVE' })
      .then((response) =>
        response.classes.map((entry) => ({ id: entry.id, name: entry.name })),
      )
      .catch(() => [] as { id: string; name: string }[]),
  ]);

  return (
    <StudioShell
      academyId={academyId}
      description={t('people.description')}
      title={t('people.title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={peopleOpsNamespaces}
        resources={resources}
      >
        <PeopleDirectory
          academyId={academyId}
          classes={classes}
          initialData={page}
          initialKey={serializePeopleQuery(query)}
        />
      </PageTranslationsProvider>
    </StudioShell>
  );
}
