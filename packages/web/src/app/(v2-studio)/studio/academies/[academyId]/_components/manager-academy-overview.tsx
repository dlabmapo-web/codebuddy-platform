import type { ManagerOverview, OverviewRange } from '@cove/shared';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { managerNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { DEFAULT_RANGE } from '../_hooks/use-manager-overview';
import { managerRanges } from '../_lib/manager-view';
import { ManagerOverviewWorkspace } from './manager-overview/manager-overview-workspace';

/**
 * The Manager's academy overview, rendered on the server for the period the URL
 * asks for.
 *
 * Server-rendered rather than fetched on mount so a shared link opens on its own
 * numbers instead of a skeleton that then jumps — a manager forwarding "look at
 * the last thirty days" should have the recipient land on it.
 *
 * A failure here is not fatal. The client owns the same query and will ask
 * again with a visible error and a retry, which is the honest behaviour for a
 * page whose whole job is to be trusted: an overview that silently rendered
 * nothing would read as a quiet academy.
 *
 * The copy is mounted here rather than in the studio layout. It is a large
 * namespace used by one role on one route, and every Teacher and Student
 * loading this path would otherwise pay for it in their RSC payload.
 */
export async function ManagerAcademyOverview({
  academyId,
  searchParams,
}: {
  academyId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, managerNamespaces);
  const range = readRange(searchParams.range);

  let overview: ManagerOverview | null = null;
  try {
    overview = await createServerORPCClient().academyOperationsOverview.get({
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
      namespaces={managerNamespaces}
      resources={resources}
    >
      <ManagerOverviewWorkspace
        academyId={academyId}
        initialData={overview}
        // The exact period the server rendered for. Anything else refetches
        // rather than showing one window's totals under another's label.
        initialRange={range}
      />
    </PageTranslationsProvider>
  );
}

/** Anything unsupported falls back rather than failing. */
function readRange(value: string | string[] | undefined): OverviewRange {
  const first = Array.isArray(value) ? value[0] : value;
  return managerRanges.find((range) => range === first) ?? DEFAULT_RANGE;
}
