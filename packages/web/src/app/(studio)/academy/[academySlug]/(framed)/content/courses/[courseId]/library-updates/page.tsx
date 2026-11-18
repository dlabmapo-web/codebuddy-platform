import Link from 'next/link';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { BackLink } from '@/components/studio/back-link';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { librarySyncNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageContent } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { LibraryUpdates } from './_components/library-updates';

/**
 * Library updates for one linked copy (library sync design §18.2): the
 * decisions head office's releases could not make alone, and what arrived.
 *
 * The page's data is read during the server render and handed down, so the
 * list does not wait on a second round trip after hydration (AGENTS.md rule 6).
 */
export default async function LibraryUpdatesPage({
  params, searchParams,
}: {
  params: Promise<{ academySlug: string; courseId: string }>;
  searchParams: Promise<{ nodeKey?: string | string[] }>;
}) {
  const { academySlug, courseId } = await params;
  const search = await searchParams;
  const nodeKey = typeof search.nodeKey === 'string' ? search.nodeKey : undefined;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canManageContent(roles)) notFound();
  const { t } = await getServerTranslation(['library-sync']);

  // One call: the API checks access once and reads the rest together.
  let initial;
  try {
    const updates = await createServerORPCClient().academyLibrarySync.updates({
      academyId,
      courseId,
      nodeKey,
    });
    initial = updates.sync ? updates : null;
  } catch (error) {
    if (isAccessDeniedError(error)) notFound();
    initial = null;
  }

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, librarySyncNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={librarySyncNamespaces}
      resources={resources}
    >
      <StudioPage
        back={
          <BackLink
            href={routes.academyLearnCourse(academySlug, courseId)}
            label={t('page.back')}
          />
        }
        description={t('page.description')}
        title={nodeKey ? initial?.conflicts.find(item => item.nodeKey === nodeKey)?.path.at(-1) ?? t('page.title') : t('page.title')}
      >
        {(initial?.sync?.unmatchedCount ?? 0) > 0 ? (
          <Link
            className="mb-4 inline-block font-semibold text-brand underline"
            href={routes.academyCourseLibraryMatches(academySlug, courseId)}
          >
            {t('legacy.title')} ({initial?.sync?.unmatchedCount})
          </Link>
        ) : null}
        {initial ? (
          <LibraryUpdates
            academyId={academyId}
            canResolve={canManageContent(roles)}
            courseId={courseId}
            initial={initial}
            nodeKey={nodeKey}
          />
        ) : (
          <p className="text-[14px] text-sub">{t('page.not_linked')}</p>
        )}
      </StudioPage>
    </PageTranslationsProvider>
  );
}
