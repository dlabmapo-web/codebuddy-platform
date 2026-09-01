import { requireAcademyRoute } from '@/lib/academy-route';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { destructiveNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import {
  canManageContent,
} from '@/lib/academy-access-state';
import { CoursesManager } from './_components/courses-manager';

export default async function CoursesPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
    // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, role } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['courses']);
  let courses = null;
  let canEdit = false;

  try {
    const client = createServerORPCClient();
    const result = await client.academyCourses.list({ academyId });
    courses = result.courses;
    canEdit = canManageContent(role);
  } catch {
    // The permission-aware state is rendered below.
  }

  const locale = await getLocale();
  const { resources: destructiveResources } = await initTranslations(
    locale,
    destructiveNamespaces,
  );

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={destructiveNamespaces}
      resources={destructiveResources}
    >
    <StudioPage
      bleed
      description={t('description')}
      title={t('title')}
    >
      {courses ? (
        <CoursesManager
          academyId={academyId}
          canEdit={canEdit}
          initialCourses={courses}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('forbidden_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('forbidden_body')}
          </p>
        </div>
      )}
    </StudioPage>
    </PageTranslationsProvider>
  );
}
