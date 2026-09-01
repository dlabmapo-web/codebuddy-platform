import { parseAuditQuery } from '@/app/(platform)/admin/_lib/audit-query';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { AuditTrail } from './_components/audit-trail';
import { AuditPager } from './_components/audit-pager';

/**
 * Everything that has happened on Cove.
 *
 * `AuditLog` has been written since the first release and read by nothing. This
 * is the page that makes it worth the columns — and, since support access
 * shipped, the page an academy is entitled to see.
 */
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-audit']);
  const query = parseAuditQuery(await searchParams);

  let result: Awaited<
    ReturnType<ReturnType<typeof createServerORPCClient>['platformAudit']['list']>
  > | null = null;
  let denied = false;
  try {
    result = await createServerORPCClient().platformAudit.list(query);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-audit:subtitle')}
      title={t('platform-audit:title')}
    >
      {result ? (
        <div className="grid gap-4">
          <AuditTrail
            emptyBody={t('platform-audit:empty_body')}
            emptyTitle={t('platform-audit:empty')}
            entries={result.entries}
          />
          <AuditPager
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
          />
        </div>
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-audit:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-audit:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
