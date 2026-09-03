import type { ListPlatformRankingResult } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import {
  parseRankingQuery,
  rankingListInput,
  rankingListKey,
} from '../_lib/ranking-query';
import { RankingTable } from './_components/ranking-table';

/**
 * Every academy's class rankings, in one place.
 *
 * The console's counterpart to the manager's `points/classes`. A manager holds
 * one academy and picks a class; an operator holds none, so this answers the
 * step in front of that — which class, out of every class on the platform —
 * and then mounts the same board.
 *
 * The first page is fetched on the server so an operator sees rows rather than
 * a spinner, and handed to the client table keyed by the query it was fetched
 * for. Only a *change* costs a round trip. The board below is deliberately not
 * server-rendered: a cold link with a class in it is rare, and fetching a board
 * nobody opened would put a second aggregate on the critical path of every
 * visit.
 *
 * `points` is asked for through the shell rather than added to the console's
 * namespace list: the board's vocabulary is large and read on this route and
 * the ledger only. It must not be a nested provider — see `PlatformShell`.
 */
export default async function PlatformRankingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-ranking']);
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value ?? '']) {
      if (one) search.append(key, one);
    }
  }
  const query = parseRankingQuery(search.toString());

  let initialData: ListPlatformRankingResult | null = null;
  let denied = false;
  try {
    initialData = await createPlatformServerORPCClient().platformRanking.classes(
      rankingListInput(query),
    );
  } catch (error) {
    // The two cases stay apart, as they do on every other console list.
    // Reporting a connection fault as "you do not have permission" sends an
    // operator hunting for a role they already hold.
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-ranking:subtitle')}
      namespaces={['points']}
      title={t('platform-ranking:title')}
    >
      {initialData ? (
        <RankingTable
          initialData={initialData}
          initialKey={rankingListKey(query)}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-ranking:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-ranking:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
