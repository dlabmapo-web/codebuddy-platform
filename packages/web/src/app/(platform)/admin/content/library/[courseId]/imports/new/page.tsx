import Link from 'next/link';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { CourseImportWizard } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/imports/_components/course-import-wizard';
import { BackLink } from '@/components/studio/back-link';
import { createContentPaths } from '@/components/studio/content-paths';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { contentImportNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { requireLibraryAcademyId } from '../../../_lib/require-library';

/**
 * The workbook importer, over a master course.
 *
 * The reason it is here at all: head office writes more problems than anyone
 * else on the platform, and a course authored once is taught by every branch.
 * Typing a hundred problems into a form to reach that is the work the workbook
 * exists to remove, and the importer already does it — over any academy, and a
 * library is one.
 *
 * No role check of its own, unlike the academy route. There a Team Lead's
 * colleague could reach the URL and be shown a screen of controls that would
 * all fail; here the address is inside the console, and reaching it at all
 * means holding `platform.library.read`. The write is checked where it always
 * was: `content.import`, on every server call the wizard makes.
 */
export default async function LibraryCourseImportPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const academyId = await requireLibraryAcademyId();
  const locale = await getLocale();
  const [{ t }, { resources }] = await Promise.all([
    getServerTranslation(['content-import']),
    initTranslations(locale, contentImportNamespaces),
  ]);

  let courseTitle: string | null = null;
  let problemCount = 0;
  let loadFailed = false;
  try {
    const tree = await createPlatformServerORPCClient().academyCourses.getTree({
      academyId,
      courseId,
    });
    courseTitle = tree.course.title;
    // Prepare needs to know whether a workbook of the current course would
    // exceed the importer's own cap, so it can say so before offering one.
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
  } catch (error) {
    if (!isAccessDeniedError(error)) loadFailed = true;
  }

  const contentPaths = createContentPaths('', 'library');

  return (
    <PlatformShell
      back={
        <BackLink
          href={contentPaths.course(courseId)}
          label={courseTitle ?? t('page_title')}
        />
      }
      bleed
      description={t('page_description')}
      title={t('page_title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={contentImportNamespaces}
        resources={resources}
      >
        {courseTitle ? (
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
              href={contentPaths.course(courseId)}
            >
              {t('unavailable.back')}
            </Link>
          </div>
        )}
      </PageTranslationsProvider>
    </PlatformShell>
  );
}
