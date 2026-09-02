import type { ListPlatformApplicationsResult } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import {
  parseApplicationsQuery,
  serializeApplicationsQuery,
} from '../_lib/applications-query';
import { ApplicationsTable } from './_components/applications-table';

/**
 * Everyone waiting to be let into an academy, on one page.
 *
 * The console's backstop rather than its inbox. An academy's own manager
 * reviews its applicants, and this page exists for the ones no manager can
 * reach: an academy created open, or one whose only manager was suspended.
 * Both leave a queue behind `academy.applications.review`, a permission no
 * member of that academy holds — so an operator is the only person on the
 * platform who can answer them.
 *
 * The summary strip is rendered by the table below rather than here, so its
 * counts move with the academy facet — an operator narrowed to one academy is
 * shown that academy's queue. It is `UserComposition`'s contract, and the
 * reason that component sits inside `UserTable` too.
 *
 * The first page is fetched on the server so an operator sees rows rather than
 * a spinner, and handed to the client table keyed by the query it was fetched
 * for, so a filtered address renders its filtered page directly and only a
 * *change* costs a round trip.
 *
 * The failure branch tells two cases apart, as the users and content pages do:
 * a genuine permission answer and the server not answering. Reporting a
 * connection fault as "you do not have permission" sends an operator looking
 * for a role they already hold.
 */
export default async function PlatformApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-applications']);
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value ?? '']) {
      if (one) search.append(key, one);
    }
  }
  const query = parseApplicationsQuery(search.toString());

  let initialData: ListPlatformApplicationsResult | null = null;
  let denied = false;
  try {
    initialData = await createServerORPCClient().platformApplications.list(
      query,
    );
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-applications:subtitle')}
      title={t('platform-applications:title')}
    >
      {initialData ? (
        <ApplicationsTable
          initialData={initialData}
          initialKey={serializeApplicationsQuery(query)}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-applications:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-applications:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
