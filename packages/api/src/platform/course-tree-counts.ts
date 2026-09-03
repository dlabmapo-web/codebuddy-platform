import { problemWithoutTests } from "./content-stat-predicates.js";

/**
 * How much is in a course, counted by the database.
 *
 * Loading the tree to count it would cost forty rows to answer one number, on
 * a page showing twenty-five courses. This selects the counts themselves, and
 * — for the one thing a count cannot express — the ids of only the problems
 * that cannot grade, which on a healthy course selects nothing at all.
 *
 * Shared by the cross-academy browser and the library, because the two draw
 * the same four numbers and a second copy of this shape is a second place for
 * "how many lectures" to drift.
 */
export const courseTreeCountSelect = {
  // No `_count` for modules: the tree below already loads one row per module,
  // so their number is `modules.length`. Asking the database for it as well
  // would collide with any caller that counts something else on the same
  // course — which is exactly what the cross-academy browser does with
  // `classAssignments`.
  modules: {
    select: {
      _count: { select: { lectures: true } },
      lectures: {
        select: {
          _count: { select: { materials: true } },
          materials: { where: problemWithoutTests, select: { id: true } },
        },
      },
    },
  },
} as const;

type CountedCourse = {
  modules: {
    _count: { lectures: number };
    lectures: {
      _count: { materials: number };
      materials: { id: string }[];
    }[];
  }[];
};

export type CourseTreeCounts = {
  moduleCount: number;
  lectureCount: number;
  exerciseCount: number;
  problemsWithoutTests: number;
};

export function courseTreeCounts(record: CountedCourse): CourseTreeCounts {
  return {
    moduleCount: record.modules.length,
    lectureCount: record.modules.reduce(
      (sum, module) => sum + module._count.lectures,
      0,
    ),
    exerciseCount: record.modules.reduce(
      (sum, module) =>
        sum +
        module.lectures.reduce(
          (inner, lecture) => inner + lecture._count.materials,
          0,
        ),
      0,
    ),
    problemsWithoutTests: record.modules.reduce(
      (sum, module) =>
        sum +
        module.lectures.reduce(
          (inner, lecture) => inner + lecture.materials.length,
          0,
        ),
      0,
    ),
  };
}
