import {
  platformRoleHasPermission,
  type ContentLens,
} from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { getAccount, createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import {
  contentSummaryKey,
  parseContentQuery,
  serializeContentQuery,
} from '../../_lib/content-query';
import type { ContentPage } from '../../_hooks/use-platform-content';
import { ContentTable } from '../_components/content-table';
import { contentNamespaces } from '@/i18n/namespaces';

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
  const account = await getAccount();
  const canCopyToLibrary =
    platformRoleHasPermission(account.user.platformRole, 'platform.library.manage') &&
    platformRoleHasPermission(account.user.platformRole, 'platform.academies.inspect') &&
    platformRoleHasPermission(account.user.platformRole, 'platform.content.read');
  let initialData: ContentPage | null = null;
  let denied = false;

  // The table is the primary content. Supplementary counts load through the
  // existing client query, so a slow summary cannot hold back usable rows.
  try {
    initialData = lens === 'courses'
      ? await client.platformContent.courses(query)
      : await client.platformContent.classes(query);
  } catch (error) {
    denied = isAccessDeniedError(error);
  }

  return (
    <PlatformShell
      bleed
      // Both content lenses reach the academy's visibility modal, whose copy
      // left the layout payload with the rest of the builder's.
      namespaces={[...contentNamespaces, 'platform-library']}
      description={t(`platform-content:lens_description.${lens}`)}
      title={t(`platform-content:lens.${lens}`)}
    >
      <div className="grid gap-5">
        {initialData ? (
          <ContentTable
            canCopyToLibrary={canCopyToLibrary}
            initialData={initialData}
            initialKey={serializeContentQuery(query)}
            initialSummary={null}
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
