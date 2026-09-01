import type { ListPlatformUsersResult } from '@cove/shared';
import {
  parsePlatformUsersQuery,
  serializePlatformUsersQuery,
} from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { UserTable } from '../_components/user-table';

/**
 * Every account on Cove, on one page.
 *
 * One page and not six. The lens paths this replaces —
 * `/admin/users/students`, `/teachers`, `/staff` — were the same table with a
 * role facet fixed by the URL, and the rail that reached them duplicated the
 * facet directly beneath it. What they were worth keeping for was the counts,
 * and those are now the summary strip at the top of the table, which states
 * the whole composition at once rather than one number per tab. The old paths
 * redirect here with their role already in the query.
 *
 * The first page is fetched on the server so the operator sees rows rather
 * than a spinner, and handed to the client table as `initialData` keyed by the
 * query it was fetched for — so a filtered address renders its filtered page
 * directly, and only a *change* costs a round trip.
 *
 * The failure branch tells two cases apart, as the academies page does: a
 * genuine permission answer and the server not answering. Reporting a
 * connection fault as "you do not have permission" sends an operator looking
 * for a role they already hold.
 */
export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-users']);
  const query = parsePlatformUsersQuery(await searchParams);

  let initialData: ListPlatformUsersResult | null = null;
  let denied = false;
  try {
    initialData = await createServerORPCClient().platformUsers.list(query);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-users:subtitle')}
      title={t('platform-users:title')}
    >
      {initialData ? (
        <UserTable
          initialData={initialData}
          initialKey={serializePlatformUsersQuery(query)}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-users:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-users:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
