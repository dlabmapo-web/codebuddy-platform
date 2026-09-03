import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
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
  // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const client = createServerORPCClient();
  let context;
  let solutionCode = '';
  try {
    context = await client.academyCourses.getExercise({
      academyId,
      courseId,
      lectureId,
      materialId,
    });
  } catch {
    notFound();
  }
  const canEdit = canManageExercises(roles);
  if (canEdit) {
    // Its own request, and its own failure. The model solution is the one
    // field this page can open without: legacy problems have none, and the
    // save path refuses a blank one anyway, so an unreadable answer costs the
    // author a retype rather than the whole editor. Letting it throw here sent
    // the entire problem to the error boundary over a field that is optional
    // for most of the existing curriculum.
    solutionCode = await client.academyCourses
      .getExerciseSolution({ academyId, courseId, lectureId, materialId })
      .then((solution) => solution.solutionCode ?? '')
      .catch(() => '');
  }

  return (
    <StudioPage bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        initialSolutionCode={solutionCode}
        lectureId={lectureId}
      />
    </StudioPage>
  );
}
