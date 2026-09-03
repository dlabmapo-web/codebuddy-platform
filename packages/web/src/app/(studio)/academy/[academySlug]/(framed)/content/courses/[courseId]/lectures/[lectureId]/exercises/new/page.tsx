import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import type { ExerciseAuthoringContext } from '@cove/shared';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
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
  // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const client = createServerORPCClient();
  const tree = await client.academyCourses.getTree({ academyId, courseId });
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
  const canEdit = canManageExercises(roles);
  if (!canEdit) notFound();

  return (
    <StudioPage bleed title={tree.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit
        courseId={courseId}
        initialContext={context}
        initialSolutionCode=""
        lectureId={lectureId}
      />
    </StudioPage>
  );
}
