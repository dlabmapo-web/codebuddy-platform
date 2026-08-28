import type { CourseTree as SharedCourseTree } from '@cove/shared';

export type CourseTree = SharedCourseTree;
export type CourseModule = CourseTree['modules'][number];
export type CourseLecture = CourseModule['lectures'][number];

/**
 * Shared so saving a problem can invalidate the exact tree the builder reads.
 * Without this the builder would serve its cached copy for a full staleTime.
 */
export function courseTreeQueryKey(academyId: string, courseId: string) {
  return ['academy', academyId, 'course', courseId] as const;
}

/**
 * The list with one item moved to another index.
 *
 * Deliberately not a swap. Moving the eighth item to second shifts the six
 * between them down one place, which is what a reader means by "move it
 * there"; a swap would exchange two items and leave the rest where they were.
 *
 * `to` is the index the item should end up at, read after the move. Both
 * indices are clamped rather than trusted, so a stale list cannot drop an item
 * from the ordering the server is about to be given — it must receive every
 * id it already has.
 */
export function reordered<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved!);
  return next;
}

export function countLectures(tree: CourseTree) {
  return tree.modules.reduce(
    (total, courseModule) => total + courseModule.lectures.length,
    0,
  );
}
