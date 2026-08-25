import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import Link from 'next/link';

import { StudioShell } from '../../../../../_components/studio-shell';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { contentImportNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import { academyRoleFor, canImportContent } from '@/lib/academy-access-state';
import { isAccessDeniedError } from '@/lib/api-errors';
import { CourseImportWizard } from '../_components/course-import-wizard';

/**
 * The importer, on its own route inside one course.
 *
 * §4.1 puts it here rather than in a modal because the Review stage needs the
 * room, and the URL carries the course so the wizard can never be pointed at a
 * different one than the builder it was opened from.
 *
 * The permission is checked here *and* on every server call the wizard makes.
 * This one saves a Team Lead's colleague from a screen full of controls that
 * would all fail; the ones in the API are the boundary.
 */
export default async function NewCourseImportPage({
  params,
}: {
  params: Promise<{ academySlug: string; courseId: string }>;
}) {
  const { academySlug, courseId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['content-import']),
    initTranslations(locale, contentImportNamespaces),
  ]);

  let courseTitle: string | null = null;
  let problemCount = 0;
  let allowed = false;
  let loadFailed = false;

  try {
    const client = createServerORPCClient();
    const [tree, account] = await Promise.all([
      client.academyCourses.getTree({ academyId, courseId }),
      client.auth.me({}),
    ]);
    courseTitle = tree.course.title;
    // §4.3 — Prepare needs to know whether the current-course workbook would
    // exceed the importer's own cap, so it can say so before offering it.
    problemCount = tree.modules.reduce(
      (total, module) =>
        total +
        module.lectures.reduce(
          (lectureTotal, lecture) =>
            lectureTotal +
            lecture.materials.filter(
              (material) => material.programmingExercise !== null,
            ).length,
          0,
        ),
      0,
    );
    allowed = canImportContent(academyRoleFor(account, academyId));
  } catch (error) {
    // Only access denial gets the unavailable state; anything else is a real
    // fault and would otherwise masquerade as a permissions problem.
    if (!isAccessDeniedError(error)) {
      loadFailed = true;
      console.error('[content-import] failed to load course', {
        academyId,
        courseId,
        error,
      });
    }
  }

  return (
    <StudioShell
      academyId={academyId}
      description={t('page_description')}
      title={t('page_title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={contentImportNamespaces}
        resources={resources}
      >
        {courseTitle && allowed ? (
          <CourseImportWizard
            academyId={academyId}
            courseId={courseId}
            courseTitle={courseTitle}
            problemCount={problemCount}
          />
        ) : (
          <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
            <h2 className="text-[15px] font-bold text-danger">
              {loadFailed
                ? t('unavailable.load_failed_title')
                : t('unavailable.denied_title')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-sub">
              {loadFailed
                ? t('unavailable.load_failed_body')
                : t('unavailable.denied_body')}
            </p>
            <Link
              className="mt-4 inline-block text-[14px] font-bold text-brand underline underline-offset-4"
              href={`${routes.academy(academySlug)}/content/courses/${courseId}`}
            >
              {t('unavailable.back')}
            </Link>
          </div>
        )}
      </PageTranslationsProvider>
    </StudioShell>
  );
}
