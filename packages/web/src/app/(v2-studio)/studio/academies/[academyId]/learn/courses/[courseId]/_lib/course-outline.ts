import type { LearnCourseOutline } from '@cove/shared';

export function filterCourseModules(
  outline: LearnCourseOutline,
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return outline.modules;

  return outline.modules
    .map((module) => ({
      ...module,
      lectures: module.lectures
        .map((lecture) => ({
          ...lecture,
          exercises: lecture.exercises.filter((exercise) =>
            exercise.title.toLocaleLowerCase().includes(needle),
          ),
        }))
        .filter((lecture) => lecture.exercises.length > 0),
    }))
    .filter((module) => module.lectures.length > 0);
}

export function toggleCollapsedId(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function isOutlineItemExpanded({
  collapsedIds,
  forceExpanded,
  id,
}: {
  collapsedIds: Set<string>;
  forceExpanded: boolean;
  id: string;
}) {
  return forceExpanded || !collapsedIds.has(id);
}

export function formatProblemOutlineNumber(
  modulePosition: number,
  lecturePosition: number,
  problemPosition: number,
) {
  return `${modulePosition}-${lecturePosition}-${problemPosition}`;
}
