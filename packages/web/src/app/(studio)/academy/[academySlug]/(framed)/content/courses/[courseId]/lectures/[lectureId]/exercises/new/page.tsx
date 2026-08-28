import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import type { ExerciseAuthoringContext } from '@cove/shared';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
  academyRoleFor,
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import { ExerciseWorkspace } from '../_components/exercise-workspace';

export default async function NewExercisePage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    lectureId: string;
  }>;
}) {
  const { academySlug, courseId, lectureId } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const client = createServerORPCClient();
  const [tree, account] = await Promise.all([
    client.academyCourses.getTree({ academyId, courseId }),
    getAccount(),
  ]);
  const courseModule = tree.modules.find((item) =>
    item.lectures.some((lecture) => lecture.id === lectureId),
  );
  const lecture = courseModule?.lectures.find((item) => item.id === lectureId);
  if (!courseModule || !lecture) notFound();

  const context: ExerciseAuthoringContext = {
    course: { id: tree.course.id, title: tree.course.title },
    module: { id: courseModule.id, title: courseModule.title },
    lecture: { id: lecture.id, title: lecture.title },
    material: null,
  };
  const canEdit = canManageExercises(academyRoleFor(account, academyId));
  if (!canEdit) notFound();

  return (
    <StudioPage bleed title={tree.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit
        courseId={courseId}
        initialContext={context}
        lectureId={lectureId}
      />
    </StudioPage>
  );
}
