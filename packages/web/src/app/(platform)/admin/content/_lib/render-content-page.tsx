import type { ContentLens, PlatformContentSummary } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import {
  contentSummaryKey,
  parseContentQuery,
  serializeContentQuery,
} from '../../_lib/content-query';
import type { ContentPage } from '../../_hooks/use-platform-content';
import { ContentTable } from '../_components/content-table';

/**
 * A curriculum page — Courses or Classes — across every academy.
 *
 * One function behind two routes, as the users directory is behind four. The
 * first page is fetched on the server so an operator sees rows rather than a
 * spinner, and only a filter change costs a round trip.
 *
 * The heading is the kind, not the tool. Both routes were titled "Content"
 * while a chip inside the toolbar decided which of them you were on, which is
 * the whole reason an operator could not tell the two pages apart.
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

  // Fetched together, but they fail apart. The summary is eight counts across
  // every academy and is the likeliest call on this page to time out; the rows
  // are what the operator came for. Folding both into one `Promise.all` made a
  // slow count answer "Content is unavailable" over a table that had loaded.
  const [rows, summary] = await Promise.allSettled([
    lens === 'courses'
      ? client.platformContent.courses(query)
      : client.platformContent.classes(query),
    client.platformContent.summary({ academyIds: query.academyIds }),
  ]);

  if (rows.status === 'fulfilled') {
    initialData = rows.value;
  } else {
    denied = isAccessDeniedError(rows.reason);
  }
  // No strip rather than no page. The client refetches it on mount, so a
  // summary that failed here is usually on screen a moment later.
  const initialSummary: PlatformContentSummary | null =
    summary.status === 'fulfilled' ? summary.value : null;

  return (
    <PlatformShell
      bleed
      description={t(`platform-content:lens_description.${lens}`)}
      title={t(`platform-content:lens.${lens}`)}
    >
      <div className="grid gap-5">
        {initialData ? (
          <ContentTable
            initialData={initialData}
            initialKey={serializeContentQuery(query)}
            initialSummary={initialSummary}
            initialSummaryKey={contentSummaryKey(query.academyIds)}
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
