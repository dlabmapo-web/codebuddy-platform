import type { Prisma } from "../generated/prisma/client.js";

/**
 * The predicates shared by academy health and the cross-academy content
 * summary. Keeping the teacher and grading rules here prevents the two
 * operator surfaces from disagreeing about the same academy.
 */
export function contentStatPredicates(academyIds?: readonly string[]) {
  const academyId: Prisma.StringFilter | string | undefined = academyIds
    ? { in: [...academyIds] }
    : undefined;
  const academyScope: Prisma.CourseWhereInput = academyId ? { academyId } : {};
  const classScope: Prisma.ClassWhereInput = academyId ? { academyId } : {};
  const problemScope: Prisma.MaterialWhereInput = academyId
    ? {
        lecture: {
          courseModule: { course: { academyId } },
        },
      }
    : {};

  const activeClass: Prisma.ClassWhereInput = {
    ...classScope,
    status: "ACTIVE",
  };
  const problem: Prisma.MaterialWhereInput = {
    type: "PROGRAMMING_EXERCISE",
    ...problemScope,
  };

  return {
    course: academyScope,
    publishedCourse: {
      ...academyScope,
      isVisible: true,
    } satisfies Prisma.CourseWhereInput,
    class: classScope,
    activeClass,
    classWithoutTeacher: {
      ...activeClass,
      OR: [
        { teacherMembershipId: null },
        {
          assignedTeacher: {
            OR: [
              { role: { not: "TEACHER" } },
              { status: { not: "ACTIVE" } },
            ],
          },
        },
      ],
    } satisfies Prisma.ClassWhereInput,
    problem,
    problemWithoutTests: {
      ...problem,
      OR: [
        { programmingExercise: { is: null } },
        { programmingExercise: { testCases: { none: {} } } },
      ],
    } satisfies Prisma.MaterialWhereInput,
  };
}
