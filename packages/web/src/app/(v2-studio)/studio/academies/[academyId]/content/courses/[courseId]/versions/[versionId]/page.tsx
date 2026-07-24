import Link from 'next/link';

import { StudioShell } from '../../../../../_components/studio-shell';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import {
  academyRoleFor,
  canManageContent,
  canManageExercises,
  canPublishContent,
} from '@/lib/academy-access-state';
import { CourseBuilder } from './_components/course-builder';

export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
    versionId: string;
  }>;
}) {
  const { academyId, courseId, versionId } = await params;
  const { t } = await getServerTranslation(['content']);
  let initialTree = null;
  let canEditCurriculum = false;
  let canEditExercises = false;
  let canPublish = false;

  try {
    const client = createServerORPCClient();
    const [tree, account] = await Promise.all([
      client.academyCourses.getDraftTree({ academyId, courseId, versionId }),
      client.auth.me({}),
    ]);
    initialTree = tree;
    const role = academyRoleFor(account, academyId);
    canEditCurriculum = canManageContent(role);
    canEditExercises = canManageExercises(role);
    canPublish = canPublishContent(role);
  } catch {
    // The scoped not-found/forbidden state is rendered below.
  }

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={
        initialTree
          ? initialTree.version.status === 'DRAFT'
            ? t('builder.draft_description')
            : t('builder.published_description')
          : undefined
      }
      title={initialTree?.course.title ?? t('builder.fallback_title')}
    >
      {initialTree ? (
        <CourseBuilder
          academyId={academyId}
          canEditCurriculum={canEditCurriculum}
          canEditExercises={canEditExercises}
          canPublish={canPublish}
          courseId={courseId}
          initialTree={initialTree}
          versionId={versionId}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {t('builder.unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {t('builder.unavailable_body')}
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
