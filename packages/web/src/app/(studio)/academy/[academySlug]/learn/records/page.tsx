import { requireAcademyRoute } from '@/lib/academy-route';
import type { AnswerRecordsResult } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../_components/studio-shell';
import { AnswerRecords } from './_components/answer-records';
import { parseRecordsQuery } from './_lib/records-url';

/**
 * Answer records.
 *
 * The first page is rendered on the server for whatever state the URL asks
 * for, so a shared link opens on its own rows rather than on a loading table
 * that then jumps. `null` is the failure and an empty `rows` array is the
 * empty result: a service outage can never render as "you have no history".
 */
export default async function AnswerRecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const query = parseRecordsQuery(await searchParams);
  const { t } = await getServerTranslation(['learn']);

  let records: AnswerRecordsResult | null = null;
  try {
    records = await createServerORPCClient().learn.listAnswerRecords({
      academyId,
      ...(query.q ? { q: query.q } : {}),
      ...(query.results.length ? { results: query.results } : {}),
      ...(query.classIds.length ? { classIds: query.classIds } : {}),
      ...(query.courseIds.length ? { courseIds: query.courseIds } : {}),
      ...(query.moduleIds.length ? { moduleIds: query.moduleIds } : {}),
      ...(query.lectureIds.length ? { lectureIds: query.lectureIds } : {}),
      ...(query.sort ? { sort: query.sort, direction: query.direction } : {}),
      page: query.page,
    });
  } catch {
    // The permission-aware error state renders inside the client component,
    // which also owns Retry.
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={t('records.description')}
      title={t('records.title')}
    >
      <AnswerRecords academyId={academyId} initialData={records} />
    </StudioShell>
  );
}
