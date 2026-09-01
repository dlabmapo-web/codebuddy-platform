import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { GrantList } from './_components/grant-list';

/**
 * Every time Cove has been inside a customer's academy.
 *
 * The page that makes support access defensible: it exists so the answer to
 * "has anybody at Cove been reading our data" is a page rather than a promise.
 */
export default async function PlatformAccessPage() {
  const { t } = await getServerTranslation(['platform', 'platform-support']);

  let result: Awaited<
    ReturnType<ReturnType<typeof createServerORPCClient>['platformSupport']['list']>
  > | null = null;
  let denied = false;
  try {
    result = await createServerORPCClient().platformSupport.list({});
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-support:subtitle')}
      title={t('platform-support:title')}
    >
      {result ? (
        <GrantList grants={result.grants} liveCount={result.liveCount} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied
              ? t('unavailable.forbidden_title')
              : t('platform-support:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied
              ? t('unavailable.forbidden_body')
              : t('platform-support:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
