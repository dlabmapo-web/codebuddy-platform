import { requireAcademyRoute } from '@/lib/academy-route';
import type { PointsPage } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../_components/studio-shell';
import { PointsWorkspace } from './_components/points-workspace';
import { parsePointsQuery } from './_lib/points-url';

/**
 * The points page.
 *
 * Rendered on the server for whatever period the URL asks for, so a shared
 * link opens on its own board rather than on a loading table that then jumps.
 * `null` is the failure; an empty ledger is the empty result. A service outage
 * can never render as "you have earned nothing".
 */
export default async function PointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const query = parsePointsQuery(await searchParams);
  const { t } = await getServerTranslation(['points']);

  let page: PointsPage | null = null;
  try {
    page = await createServerORPCClient().points.getPage({
      academyId,
      period: query.period,
      ...(query.classId ? { classId: query.classId } : {}),
    });
  } catch {
    // The error state renders inside the client component, which owns Retry.
  }

  // The workspace owns the heading rather than the shell: the period control
  // belongs beside the title it governs, and the shell's heading has nowhere
  // to put it.
  return (
    <StudioShell
      academyId={academyId}
      description={t('points:description')}
      showPageHeading={false}
      title={t('points:title')}
    >
      <PointsWorkspace academyId={academyId} initialData={page} />
    </StudioShell>
  );
}
