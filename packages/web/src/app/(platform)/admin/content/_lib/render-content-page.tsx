import type { ContentLens } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import {
  parseContentQuery,
  serializeContentQuery,
} from '../../_lib/content-query';
import type { ContentPage } from '../../_hooks/use-platform-content';
import { ContentLensTabs } from '../_components/content-lens';
import { ContentTable } from '../_components/content-table';

/**
 * The content browser, rendered for one lens.
 *
 * One function behind three routes, as the users directory is behind four. The
 * first page is fetched on the server so an operator sees rows rather than a
 * spinner, and only a filter change costs a round trip.
 */
export async function renderContentPage({
  lens,
  searchParams,
}: {
  lens: ContentLens;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { t } = await getServerTranslation(['platform', 'platform-content']);
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const one of Array.isArray(value) ? value : [value ?? '']) {
      if (one) search.append(key, one);
    }
  }
  const query = parseContentQuery(search.toString());

  const client = createServerORPCClient();
  let initialData: ContentPage | null = null;
  let denied = false;
  try {
    initialData =
      lens === 'courses'
        ? await client.platformContent.courses(query)
        : lens === 'classes'
          ? await client.platformContent.classes(query)
          : await client.platformContent.problems(query);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      description={t(`platform-content:lens_description.${lens}`)}
      title={t('platform-content:title')}
    >
      <div className="grid gap-5">
        <ContentLensTabs active={lens} />
        {initialData ? (
          <ContentTable
            initialData={initialData}
            initialKey={serializeContentQuery(query)}
            lens={lens}
          />
        ) : (
          <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
            <h2 className="text-[15px] font-bold text-danger">
              {denied
                ? t('unavailable.forbidden_title')
                : t('platform-content:unavailable.title')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {denied
                ? t('unavailable.forbidden_body')
                : t('platform-content:unavailable.body')}
            </p>
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
