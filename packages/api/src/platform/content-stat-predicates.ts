import type { Prisma } from "../generated/prisma/client.js";
import { tenantAcademies } from "./library-academy.js";

/**
 * A problem that cannot grade, with no academy scope of its own.
 *
 * The definition, in one place. Used bare inside a course tree that is already
 * scoped to one academy — where adding a scope would be wrong, because the
 * library's own courses would then count zero — and used scoped below, where
 * the question is "across the platform's customers".
 */
export const problemWithoutTests: Prisma.MaterialWhereInput = {
  type: "PROGRAMMING_EXERCISE",
  OR: [
    { programmingExercise: { is: null } },
    { programmingExercise: { testCases: { none: {} } } },
  ],
};

/**
 * The predicates shared by academy health and the cross-academy content
 * summary. Keeping the teacher and grading rules here prevents the two
 * operator surfaces from disagreeing about the same academy.
 */
export function contentStatPredicates(academyIds?: readonly string[]) {
  const academyId: Prisma.StringFilter | string | undefined = academyIds
    ? { in: [...academyIds] }
    : undefined;
  // Every scope here carries the tenant filter, named or not. These counts are
  // the console's claim about *the platform's customers*, and the content
  // library is not one: a master course counted among them would inflate every
  // tile on the summary strip and put head office's own curriculum into an
  // answer about how much academies teach.
  const academyScope: Prisma.CourseWhereInput = {
    academy: tenantAcademies,
    ...(academyId ? { academyId } : {}),
  };
  const classScope: Prisma.ClassWhereInput = {
    academy: tenantAcademies,
    ...(academyId ? { academyId } : {}),
  };
  const problemScope: Prisma.MaterialWhereInput = {
    lecture: {
      courseModule: {
        course: {
          academy: tenantAcademies,
          ...(academyId ? { academyId } : {}),
        },
      },
    },
  };

  const activeClass: Prisma.ClassWhereInput = {
    ...classScope,
    status: "ACTIVE",
  };
  const problem: Prisma.MaterialWhereInput = {
    type: problemWithoutTests.type,
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
      OR: problemWithoutTests.OR,
    } satisfies Prisma.MaterialWhereInput,
  };
}
