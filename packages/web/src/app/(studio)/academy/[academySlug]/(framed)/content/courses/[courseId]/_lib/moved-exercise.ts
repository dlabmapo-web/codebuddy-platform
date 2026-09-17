import { redirect } from 'next/navigation';

import { lectureHoldingMaterial, type CourseTree } from './course-tree';

/**
 * Send an editor opened on a problem's old lecture to where it lives now.
 *
 * Authoring URLs name the lecture, and moving a problem changes it, so a tab
 * opened before the move — or a bookmark — would otherwise land on "not found"
 * for a problem that still exists. Only a problem actually found elsewhere in
 * the same course is followed; anything else falls through to the caller's own
 * not-found. `redirect` throws, so call this outside a `try`.
 */
export async function redirectIfExerciseMoved({
  exercisePath,
  lectureId,
  loadTree,
  materialId,
}: {
  exercisePath: (lectureId: string) => string;
  lectureId: string;
  loadTree: () => Promise<CourseTree>;
  materialId: string;
}): Promise<void> {
  const tree = await loadTree().catch(() => null);
  const current = tree ? lectureHoldingMaterial(tree, materialId) : null;
  if (current && current !== lectureId) redirect(exercisePath(current));
}
