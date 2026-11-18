import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { librarySyncNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageContent, canReviewContent } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';
import { UnmatchedMaterials } from '../_components/unmatched-materials';

export default async function MatchLibraryMaterials({
  params,
}: {
  params: Promise<{ academySlug: string; courseId: string }>;
}) {
  const { academySlug, courseId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  if (!canReviewContent(roles)) notFound();
  const [initial, locale, { t }] = await Promise.all([
    createServerORPCClient().academyLibrarySync.unmatched({
      academyId,
      courseId,
    }),
    getLocale(),
    getServerTranslation(['library-sync']),
  ]);
  const { resources } = await initTranslations(locale, librarySyncNamespaces);
  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={librarySyncNamespaces}
      resources={resources}
    >
      <main className="p-5">
        <Link
          href={routes.academyCourseLibraryUpdates(academySlug, courseId)}
          className="mb-4 inline-block text-brand underline"
        >
          {t('banner.open')}
        </Link>
        <UnmatchedMaterials
          academyId={academyId}
          courseId={courseId}
          initial={initial}
          canResolve={canManageContent(roles)}
        />
      </main>
    </PageTranslationsProvider>
  );
}
