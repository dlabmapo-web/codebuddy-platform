import { requireAcademyRoute } from '@/lib/academy-route';
import Link from 'next/link';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import {
  canImportContent,
  canManageContent,
  canManageExercises,
} from '@/lib/academy-access-state';
import { isAccessDeniedError } from '@/lib/api-errors';
import { CourseBuilder } from './_components/course-builder';
import { createContentPaths } from '@/components/studio/content-paths';

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
  }>;
}) {
  const { academySlug, courseId } = await params;
  const contentPaths = createContentPaths(academySlug, 'academy');
    // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, role } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['content']);
  let initialTree = null;
  let canEditCurriculum = false;
  let canEditExercises = false;
  let canImport = false;
  let loadFailed = false;

  try {
    const client = createServerORPCClient();
    initialTree = await client.academyCourses.getTree({ academyId, courseId });
    canEditCurriculum = canManageContent(role);
    canEditExercises = canManageExercises(role);
    canImport = canImportContent(role);
  } catch (error) {
    // Only access denial gets the not-found state; anything else is a real
    // fault and would otherwise masquerade as a permissions problem.
    if (!isAccessDeniedError(error)) {
      loadFailed = true;
      console.error('[course-builder] failed to load course tree', {
        academyId,
        courseId,
        error,
      });
    }
  }

  return (
    <StudioPage
      bleed
      description={initialTree ? t('builder.description') : undefined}
      title={initialTree?.course.title ?? t('builder.fallback_title')}
    >
      {initialTree ? (
        <CourseBuilder
          academyId={academyId}
          canEditCurriculum={canEditCurriculum}
          canEditExercises={canEditExercises}
          canImport={canImport}
          courseId={courseId}
          initialTree={initialTree}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {loadFailed
              ? t('builder.load_failed_title')
              : t('builder.unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {loadFailed
              ? t('builder.load_failed_body')
              : t('builder.unavailable_body')}
          </p>
          <Link
            className="mt-4 inline-block text-[14px] font-bold text-brand underline underline-offset-4"
            href={contentPaths.courses()}
          >
            {t('builder.back_to_courses')}
          </Link>
        </div>
      )}
    </StudioPage>
  );
}
