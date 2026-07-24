import { notFound } from 'next/navigation';

import { StudioShell } from '@/app/(v2-studio)/studio/academies/[academyId]/_components/studio-shell';
import {
  academyRoleFor,
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { ExerciseWorkspace } from '../_components/exercise-workspace';

export default async function ExercisePage({
  params,
}: {
  params: Promise<{
    academyId: string;
    courseId: string;
    versionId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academyId, courseId, versionId, lectureId, materialId } = await params;
  const client = createServerORPCClient();
  let context;
  let account;
  try {
    [context, account] = await Promise.all([
      client.academyCourses.getExercise({
        academyId,
        courseId,
        versionId,
        lectureId,
        materialId,
      }),
      client.auth.me({}),
    ]);
  } catch {
    notFound();
  }
  const canEdit =
    context.version.status === 'DRAFT' &&
    canManageExercises(academyRoleFor(account, academyId));

  return (
    <StudioShell academyId={academyId} bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        lectureId={lectureId}
        versionId={versionId}
      />
    </StudioShell>
  );
}
