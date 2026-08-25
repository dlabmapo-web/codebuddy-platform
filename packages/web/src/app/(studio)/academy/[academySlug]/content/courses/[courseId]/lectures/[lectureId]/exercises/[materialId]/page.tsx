import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { StudioShell } from '@/app/(studio)/academy/[academySlug]/_components/studio-shell';
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
    academySlug: string;
    courseId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academySlug, courseId, lectureId, materialId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const client = createServerORPCClient();
  let context;
  let account;
  try {
    [context, account] = await Promise.all([
      client.academyCourses.getExercise({
        academyId,
        courseId,
        lectureId,
        materialId,
      }),
      client.auth.me({}),
    ]);
  } catch {
    notFound();
  }
  const canEdit = canManageExercises(academyRoleFor(account, academyId));

  return (
    <StudioShell academyId={academyId} bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        lectureId={lectureId}
      />
    </StudioShell>
  );
}
