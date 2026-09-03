import type { ExerciseAuthoringContext } from '@cove/shared';
import { notFound } from 'next/navigation';

import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { ExerciseWorkspace } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/exercise-workspace';
import { BackLink } from '@/components/studio/back-link';
import { createContentPaths } from '@/components/studio/content-paths';
import { createPlatformServerORPCClient } from '@/lib/orpc-server';

import { requireLibraryAcademyId } from '../../../../../_lib/require-library';

/**
 * One master problem: its statement, its solution, and its test cases.
 *
 * The same workspace a Team Lead authors in, over the library's academy. Back
 * goes to the master's own builder — there is no `from` to read here, because
 * a library problem is only ever reached by walking down its course, which is
 * the console's standing claim about where a problem lives.
 */
export default async function LibraryExercisePage({
  params,
}: {
  params: Promise<{ courseId: string; lectureId: string; materialId: string }>;
}) {
  const { courseId, lectureId, materialId } = await params;
  const academyId = await requireLibraryAcademyId();
  const client = createPlatformServerORPCClient();

  let context: ExerciseAuthoringContext;
  let solutionCode = '';
  if (materialId === 'new') {
    // A failed load and a missing lecture are different answers and used to
    // share one: `.catch(() => null)` turned every fault — a refused
    // permission, an API that did not answer — into "this problem does not
    // exist", which sends the reader looking for a page rather than for the
    // cause.
    let tree;
    try {
      tree = await client.academyCourses.getTree({ academyId, courseId });
    } catch (error) {
      console.error('[library-exercise] could not read the course tree', {
        academyId,
        courseId,
        lectureId,
        error,
      });
      throw error;
    }
    const courseModule = tree.modules.find((item) =>
      item.lectures.some((lecture) => lecture.id === lectureId),
    );
    const lecture = courseModule?.lectures.find(
      (item) => item.id === lectureId,
    );
    if (!courseModule || !lecture) {
      console.error('[library-exercise] lecture is not in this course', {
        courseId,
        lectureId,
        lectureIds: tree.modules.flatMap((m) => m.lectures.map((l) => l.id)),
      });
      notFound();
    }
    context = {
      course: { id: tree.course.id, title: tree.course.title },
      module: { id: courseModule.id, title: courseModule.title },
      lecture: { id: lecture.id, title: lecture.title },
      material: null,
    };
  } else {
    context = await client.academyCourses
      .getExercise({ academyId, courseId, lectureId, materialId })
      .catch(() => notFound());
    solutionCode = await client.academyCourses
      .getExerciseSolution({ academyId, courseId, lectureId, materialId })
      .then((solution) => solution.solutionCode ?? '')
      .catch(() => '');
  }

  const contentPaths = createContentPaths('', 'library');

  return (
    <PlatformShell
      back={
        <BackLink
          href={contentPaths.course(courseId)}
          label={context.course.title}
        />
      }
      bleed
      title={context.course.title}
    >
      <ExerciseWorkspace
        academyId={academyId}
        canEdit
        courseId={courseId}
        initialContext={context}
        initialSolutionCode={solutionCode}
        lectureId={lectureId}
      />
    </PlatformShell>
  );
}
