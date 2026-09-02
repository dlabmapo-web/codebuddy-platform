import type { ListPlatformInvitationsResult } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import {
  parseInvitationsQuery,
  serializeInvitationsQuery,
} from '../_lib/invitations-query';
import { InvitationsTable } from './_components/invitations-table';

/**
 * Every invitation on Cove Studio, and whether it arrived.
 *
 * The console's counterpart to the applications queue: applications are people
 * asking to come in, invitations are the academy asking them. Both are answered
 * behind a permission only a manager holds, which is why an academy with none
 * needs an operator for either.
 *
 * The first page is fetched on the server so an operator sees rows rather than
 * a spinner, and handed to the client table keyed by the query it was fetched
 * for — so a filtered address renders its filtered page directly, and only a
 * *change* costs a round trip.
 *
 * The failure branch tells two cases apart, as every other console list does: a
 * genuine permission answer and the server not answering. Reporting a
 * connection fault as "you do not have permission" sends an operator looking
 * for a role they already hold.
 *
 * `people-ops` is asked for through the shell rather than added to the
 * console's own namespace list: the delivery vocabulary — five states, their
 * explanations, the resend copy — is read on this one route, and every other
 * console page would otherwise carry an explanation of what a bounce is in its
 * RSC payload. It must not be a nested provider; see `PlatformShell`.
 */
export default async function PlatformInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation([
    'platform',
    'platform-invitations',
  ]);
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value ?? '']) {
      if (one) search.append(key, one);
    }
  }
  const query = parseInvitationsQuery(search.toString());

  let initialData: ListPlatformInvitationsResult | null = null;
  let denied = false;
  try {
    initialData = await createServerORPCClient().platformInvitations.list(query);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-invitations:subtitle')}
      // The delivery badge's vocabulary, on this route only.
      namespaces={['people-ops']}
      title={t('platform-invitations:title')}
    >
      {initialData ? (
        <InvitationsTable
          initialData={initialData}
          initialKey={serializeInvitationsQuery(query)}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-invitations:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-invitations:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
