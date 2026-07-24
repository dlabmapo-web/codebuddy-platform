import type { CourseDraftTree, ContentValidationIssue } from '@cove/shared';

export type CourseTree = CourseDraftTree;
export type CourseModule = CourseTree['modules'][number];
export type CourseLecture = CourseModule['lectures'][number];
export type MoveDirection = -1 | 1;

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

export function countIssuesByModule(
  issues: ContentValidationIssue[] | null,
) {
  const counts = new Map<string, number>();
  for (const issue of issues ?? []) {
    if (!issue.moduleId) continue;
    counts.set(issue.moduleId, (counts.get(issue.moduleId) ?? 0) + 1);
  }
  return counts;
}
