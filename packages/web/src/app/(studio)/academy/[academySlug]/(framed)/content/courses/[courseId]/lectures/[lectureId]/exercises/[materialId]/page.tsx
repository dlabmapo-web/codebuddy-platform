
import type { ExerciseSolutionEntry } from "@cove/shared";
import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';
import { redirectIfExerciseMoved } from '../../../../_lib/moved-exercise';
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
  // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const client = createServerORPCClient();
  let context;
  let solutions: ExerciseSolutionEntry[] = [];
  try {
    context = await client.academyCourses.getExercise({
      academyId,
      courseId,
      lectureId,
      materialId,
    });
  } catch {
    context = null;
  }
  if (!context) {
    await redirectIfExerciseMoved({
      exercisePath: (currentLectureId) =>
        `${routes.academyCourse(academySlug, courseId)}/lectures/${encodeURIComponent(currentLectureId)}/exercises/${encodeURIComponent(materialId)}`,
      lectureId,
      loadTree: () => client.academyCourses.getTree({ academyId, courseId }),
      materialId,
    });
    notFound();
  }
  const canEdit = canManageExercises(roles);
  if (canEdit) {
    // Fail closed: an unread collection must not be overwritten by an empty draft.
    solutions = await client.academyCourses
      .getExerciseSolution({ academyId, courseId, lectureId, materialId })
      .then((solution) => solution.solutions);
  }

  return (
    <StudioPage bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        initialSolutions={solutions}
        lectureId={lectureId}
      />
    </StudioPage>
  );
}
