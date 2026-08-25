import type { CourseTree as SharedCourseTree } from '@cove/shared';

export type CourseTree = SharedCourseTree;
export type CourseModule = CourseTree['modules'][number];
export type CourseLecture = CourseModule['lectures'][number];
export type MoveDirection = -1 | 1;

/**
 * Shared so saving a problem can invalidate the exact tree the builder reads.
 * Without this the builder would serve its cached copy for a full staleTime.
 */
export function courseTreeQueryKey(academyId: string, courseId: string) {
  return ['academy', academyId, 'course', courseId] as const;
}

export function swap(
  ids: string[],
  from: number,
  to: number,
): string[] {
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function countLectures(tree: CourseTree) {
  return tree.modules.reduce(
    (total, courseModule) => total + courseModule.lectures.length,
    0,
  );
}
