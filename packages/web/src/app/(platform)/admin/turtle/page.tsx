import type { TurtleUsageResult } from '@cove/shared';

import { platformTurtleNamespaces } from '@/i18n/namespaces';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../_components/platform-shell';
import { parseTurtleQuery, turtleInput } from '../_lib/turtle-query';
import { TurtleUsage } from './_components/turtle-usage';

/** Which academies use public Turtle, when, and how much. Anonymous devices, never people. */
export default async function PlatformTurtlePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ t }, params] = await Promise.all([
    getServerTranslation(['platform', 'platform-turtle']),
    searchParams,
  ]);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) search.set(key, first);
  }
  const input = turtleInput(parseTurtleQuery(search.toString()));

  let initialData: TurtleUsageResult | null = null;
  let denied = false;
  try {
    initialData = await createPlatformServerORPCClient().platformTurtle.usage(input);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t('platform-turtle:subtitle')}
      namespaces={platformTurtleNamespaces}
      title={t('platform-turtle:title')}
    >
      {initialData ? (
        <TurtleUsage initialData={initialData} initialInput={input} />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('unavailable.forbidden_title') : t('platform-turtle:unavailable.title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('unavailable.forbidden_body') : t('platform-turtle:unavailable.body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
