import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { academyLibraryNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { canManageContent } from '@/lib/academy-access-state';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient } from '@/lib/orpc-server';

import { LibraryBrowser } from './_components/library-browser';

/**
 * The courses head office publishes, and the button that copies one here.
 *
 * Which library this academy sees is not a choice on this page: it follows
 * from the academy's own organization, so a customer outside the franchise
 * sees an empty list rather than somebody else's curriculum.
 *
 * `academy-library` is a page namespace rather than part of `courses`. It is
 * read on this one route by a handful of staff, and `courses` is a layout
 * namespace — putting this vocabulary there sent it in the RSC payload of
 * every page a student loads, which is what the Korean payload budget in
 * `@cove/i18n` caught.
 */
export default async function AcademyLibraryPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['academy-library']);

  let courses = null;
  try {
    const result = await createServerORPCClient().academyLibrary.available({
      academyId,
    });
    courses = canManageContent(roles) ? result.courses : null;
  } catch {
    // The unavailable state below covers both a refusal and a fault: this page
    // offers nothing but a copy, so a reader who cannot copy has no partial
    // version of it to be shown.
  }

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, academyLibraryNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={academyLibraryNamespaces}
      resources={resources}
    >
      <StudioPage bleed description={t('body')} title={t('heading')}>
        {courses ? (
          <LibraryBrowser academyId={academyId} initialCourses={courses} />
        ) : (
          <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
            <h2 className="text-[15px] font-bold text-danger">
              {t('unavailable_heading')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {t('unavailable_body')}
            </p>
          </div>
        )}
      </StudioPage>
    </PageTranslationsProvider>
  );
}
