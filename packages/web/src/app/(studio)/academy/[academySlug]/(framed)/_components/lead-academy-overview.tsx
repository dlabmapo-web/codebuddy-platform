import type { OverviewRange, TeamLeadOverview } from '@cove/shared';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { leadNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { DEFAULT_RANGE } from '../_hooks/use-lead-overview';
import { leadRanges } from '../_lib/lead-view';
import { LeadOverviewWorkspace } from './lead-overview/lead-overview-workspace';

/**
 * The Team Lead's curriculum overview, rendered on the server for the period
 * the URL asks for.
 *
 * Server-rendered rather than fetched on mount so a shared link opens on its
 * own numbers instead of a skeleton that then jumps.
 *
 * A failure here is not fatal. The client owns the same query and will ask
 * again with a visible error and a retry, which is the honest behaviour for a
 * page whose whole job is to be trusted: an overview that silently rendered
 * nothing would read as an academy with no curriculum.
 *
 * The copy is mounted here rather than in the studio layout. It is a large
 * namespace used by one role on one route, and every Student and Teacher
 * loading this path would otherwise pay for it in their RSC payload.
 */
export async function LeadAcademyOverview({
  academyId,
  hasLeaderboard,
  searchParams,
}: {
  academyId: string;
  hasLeaderboard: boolean;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = await getLocale();
  const namespaces = hasLeaderboard
    ? [...leadNamespaces, 'points']
    : leadNamespaces;
  const { resources } = await initTranslations(locale, namespaces);
  const range = readRange(searchParams.range);

  let overview: TeamLeadOverview | null = null;
  try {
    overview = await createServerORPCClient().academyCurriculumOverview.get({
      academyId,
      range,
    });
  } catch {
    // Left to the client, which retries and can say what happened.
    overview = null;
  }

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={namespaces}
      resources={resources}
    >
      <LeadOverviewWorkspace
        academyId={academyId}
        hasLeaderboard={hasLeaderboard}
        initialData={overview}
        initialRange={range}
      />
    </PageTranslationsProvider>
  );
}

/** Anything unsupported falls back rather than failing. */
function readRange(value: string | string[] | undefined): OverviewRange {
  const first = Array.isArray(value) ? value[0] : value;
  return leadRanges.find((range) => range === first) ?? DEFAULT_RANGE;
}
