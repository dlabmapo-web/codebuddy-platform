import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
  academyRoleFor,
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
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
      getAccount(),
    ]);
  } catch {
    notFound();
  }
  const canEdit = canManageExercises(academyRoleFor(account, academyId));

  return (
    <StudioPage bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        lectureId={lectureId}
      />
    </StudioPage>
  );
}
