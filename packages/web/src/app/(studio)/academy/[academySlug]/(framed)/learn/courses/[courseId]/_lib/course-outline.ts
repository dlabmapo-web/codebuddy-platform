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

/**
 * How far through one lecture a student is.
 *
 * Derived from the progress already on the outline's exercises rather than
 * aggregated from submissions on read: the course page is one query, and a
 * lecture card must not turn it into one query per lecture.
 *
 * `percent` is `null` for a lecture with no problems. A heading lecture is not
 * 0% complete, and drawing an empty bar for it would say it is.
 */
export function lectureProgress(lecture: {
  exercises: ReadonlyArray<{ status: string }>;
}): { total: number; solved: number; percent: number | null } {
  const total = lecture.exercises.length;
  const solved = lecture.exercises.filter(
    (exercise) => exercise.status === 'SOLVED',
  ).length;
  return {
    total,
    solved,
    percent: total === 0 ? null : Math.round((solved / total) * 100),
  };
}
