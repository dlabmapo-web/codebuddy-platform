
import type { ExerciseSolutionEntry } from "@cove/shared";
import { requireAcademyRoute } from '@/lib/academy-route';
import { notFound } from 'next/navigation';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import {
  canManageExercises,
} from '@/lib/academy-access-state';
import { createServerORPCClient, getAcademyFeatures } from '@/lib/orpc-server';
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
  const canEdit = canManageExercises(roles);
  // Started beside the exercise read; consulted only when rendering.
  const compiledLanguagesRequest = canEdit ? compiledLanguagesFor(academyId) : Promise.resolve(false);
  // Requested beside the exercise rather than after it; the role decides
  // whether it is needed, and it is only consulted once the exercise exists.
  const solutionsRequest = canEdit
    ? client.academyCourses
      .getExerciseSolution({ academyId, courseId, lectureId, materialId })
      .then(
        (solution) => ({ solutions: solution.solutions }),
        (error: unknown) => ({ error }),
      )
    : null;
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
      loadTree: () => client.academyCourses.getOutline({ academyId, courseId }),
      materialId,
    });
    notFound();
  }
  if (solutionsRequest) {
    // Fail closed: an unread collection must not be overwritten by an empty draft.
    const read = await solutionsRequest;
    if ('error' in read) throw read.error;
    solutions = read.solutions;
  }

  const compiledLanguages = await compiledLanguagesRequest;
  return (
    <StudioPage bleed title={context.course.title}>
      <ExerciseWorkspace
        academyId={academyId}
        canEdit={canEdit}
        courseId={courseId}
        initialContext={context}
        compiledLanguages={compiledLanguages}
        initialSolutions={solutions}
        lectureId={lectureId}
      />
    </StudioPage>
  );
}

/**
 * Whether this academy may author C and C++. The feature list may be closed
 * to some authoring roles; a refused read offers Python only, which the API
 * enforces either way.
 */
function compiledLanguagesFor(academyId: string): Promise<boolean> {
  return getAcademyFeatures(academyId).then(
    ({ features }) => features.some((item) => item.feature === 'C_CPP_EXERCISES' && item.isEnabled),
    () => false,
  );
}
