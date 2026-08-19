import type { StudentAcademyOverview } from '@cove/shared';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { learningNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import {
  parseStudentOverviewQuery,
  serializeStudentOverviewQuery,
} from '../_lib/student-overview-url';
import { StudentOverviewWorkspace } from './student-overview/student-overview-workspace';

/**
 * The Student's own academy overview, rendered on the server for the exact
 * period the URL asks for.
 *
 * Server-rendered rather than fetched on mount because this is the page a
 * student lands on when they sign in, and the first thing it has to do is show
 * them the work they left — a skeleton that resolves a moment later is a
 * moment they spend not knowing whether there is anything to resume.
 *
 * A failure here is not fatal. The client owns the same query and will ask
 * again with a visible error and a retry, which is the honest behaviour for a
 * page a child is meant to trust: an overview that silently rendered nothing
 * would read as a quiet month.
 *
 * The copy is mounted here rather than in the studio layout. `learning` is a
 * large namespace used by one role on one route, and every Teacher and Manager
 * loading this path would otherwise pay for it in their RSC payload.
 */
export async function StudentAcademyOverview({
  academyId,
  searchParams,
}: {
  academyId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, learningNamespaces);
  const query = parseStudentOverviewQuery(searchParams);

  let overview: StudentAcademyOverview | null = null;
  try {
    overview = await createServerORPCClient().learn.getOverview({
      academyId,
      range: query.range,
      ...(query.standingClassId
        ? { standingClassId: query.standingClassId }
        : {}),
    });
  } catch {
    // Left to the client, which retries and can say what happened.
    overview = null;
  }

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={learningNamespaces}
      resources={resources}
    >
      <StudentOverviewWorkspace
        academyId={academyId}
        initialData={overview}
        // The exact state the server rendered for. Anything else refetches
        // rather than showing one period's numbers under another's label.
        initialKey={serializeStudentOverviewQuery(query)}
      />
    </PageTranslationsProvider>
  );
}
