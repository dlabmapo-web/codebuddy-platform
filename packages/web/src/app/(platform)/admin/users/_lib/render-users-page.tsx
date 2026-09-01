import type { ListPlatformUsersResult, UserLens } from '@cove/shared';
import {
  parsePlatformUsersQuery,
  userLensRoles,
  serializePlatformUsersQuery,
} from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { UserLensTabs } from '../../_components/user-lens';
import { UserTable } from '../../_components/user-table';
import { PlatformShell } from '../../_components/platform-shell';

/**
 * The directory, rendered for one lens.
 *
 * One function behind four routes. The first page is fetched on the server so
 * the operator sees rows rather than a spinner, and handed to the client table
 * as `initialData` keyed by the query it was fetched for — so a filtered
 * address renders its filtered page directly, and only a *change* costs a round
 * trip.
 *
 * The failure branch tells two cases apart, as the academies page does: a
 * genuine permission answer and the server not answering. Reporting a
 * connection fault as "you do not have permission" sends an operator looking
 * for a role they already hold.
 */
export async function renderUsersPage({
  lens,
  searchParams,
}: {
  lens: UserLens;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-users']);
  const params = await searchParams;

  const roles = userLensRoles[lens];
  const query = {
    ...parsePlatformUsersQuery(params),
    ...(roles.length > 0 ? { roles: [...roles] } : {}),
  };

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
      description={t(`platform-users:lens_description.${lens}`)}
      title={t('platform-users:title')}
    >
      <div className="grid gap-5">
        <UserLensTabs active={lens} />
        {initialData ? (
          <UserTable
            initialData={initialData}
            initialKey={serializePlatformUsersQuery(query)}
            lens={lens}
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
      </div>
    </PlatformShell>
  );
}
