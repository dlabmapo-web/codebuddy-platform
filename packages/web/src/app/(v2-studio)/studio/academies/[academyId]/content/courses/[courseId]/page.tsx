import Link from 'next/link';

import { StudioShell } from '../../../_components/studio-shell';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import {
  academyRoleFor,
  canImportContent,
  canManageContent,
  canManageExercises,
} from '@/lib/academy-access-state';
import { isAccessDeniedError } from '@/lib/api-errors';
import { CourseBuilder } from './_components/course-builder';

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
  }>;
}) {
  const { academyId, courseId } = await params;
  const { t } = await getServerTranslation(['content']);
  let initialTree = null;
  let canEditCurriculum = false;
  let canEditExercises = false;
  let canImport = false;
  let loadFailed = false;

  try {
    const client = createServerORPCClient();
    const [tree, account] = await Promise.all([
      client.academyCourses.getTree({ academyId, courseId }),
      client.auth.me({}),
    ]);
    initialTree = tree;
    const role = academyRoleFor(account, academyId);
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
    <StudioShell
      academyId={academyId}
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
            href={`/studio/academies/${academyId}/content/courses`}
          >
            {t('builder.back_to_courses')}
          </Link>
        </div>
      )}
    </StudioShell>
  );
}
