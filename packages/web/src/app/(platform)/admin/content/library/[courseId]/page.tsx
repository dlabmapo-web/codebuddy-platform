import { notFound } from 'next/navigation';

import { CourseBuilder } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_components/course-builder';
import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { PlatformShell } from '../../../_components/platform-shell';
import { requireLibraryAcademyId } from '../_lib/require-library';

/**
 * A master course's curriculum, in the builder every Team Lead already uses.
 *
 * The third surface this builder is mounted on, and it needed no change to be
 * mounted here: `createContentPaths` was already parameterized by surface, and
 * the writes underneath call `academyCourses.*`, which answer yes through the
 * library branch of `AcademyAccessService`.
 *
 * That is the whole reason the library is an academy rather than a parallel
 * content tree. Head office gets the module and lecture editors, the problem
 * authoring form, the test-case editor and the workbook importer on the first
 * day, instead of a second implementation of each to keep in step forever.
 *
 * `canImport` is the one thing this page turns on that the console's
 * academy-scoped builder leaves off. Importing into a *customer's* course is
 * their Team Lead's decision; importing into head office's own curriculum is
 * head office's, and it is the difference between authoring a hundred problems
 * and typing them.
 */
export default async function LibraryCourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const academyId = await requireLibraryAcademyId();
  const { t } = await getServerTranslation(['content', 'platform-library']);

  let initialTree = null;
  let loadFailed = false;
  try {
    initialTree = await createPlatformServerORPCClient().academyCourses.getTree({
      academyId,
      courseId,
    });
  } catch (error) {
    loadFailed = !isAccessDeniedError(error);
  }
  if (!initialTree && !loadFailed) notFound();

  return (
    <PlatformShell
      back={
        <BackLink
          href={routes.adminLibrary}
          label={t('platform-library:title')}
        />
      }
      bleed
      namespaces={['content', 'content-import', 'courses']}
      title={initialTree?.course.title ?? t('platform-library:title')}
    >
      {initialTree ? (
        <CourseBuilder
          academyId={academyId}
          canEditCurriculum
          canEditExercises
          canImport
          courseId={courseId}
          initialTree={initialTree}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('content:builder.load_failed_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('content:builder.load_failed_body')}
          </p>
        </div>
      )}
    </PlatformShell>
  );
}
