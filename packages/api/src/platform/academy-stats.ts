import type { PlatformAcademyDetail } from "@cove/shared";

import type { PrismaService } from "../database/prisma.service.js";

export type AcademyStats = Pick<
  PlatformAcademyDetail,
  "classes" | "content" | "enrolments" | "support"
>;

/**
 * What an academy actually runs, counted.
 *
 * The member counts on the summary say who belongs to an academy. These say
 * whether it works: an academy with forty students, no class and no published
 * course is not a healthy one, and the console could not tell that apart from a
 * thriving academy while it only counted people.
 *
 * Every figure is a `count` against an indexed predicate rather than a load and
 * a `.length`. A course tree is thousands of rows and this page shows one
 * number from it; reading the rows to count them would make a detail page cost
 * more than the academy's own dashboards do.
 */
export async function readAcademyStats(
  prisma: PrismaService,
  academyId: string,
  now: Date = new Date(),
): Promise<AcademyStats> {
  const activeClass = { academyId, status: "ACTIVE" } as const;
  const inAcademy = {
    lecture: { courseModule: { course: { academyId } } },
  } as const;

  const [
    totalClasses,
    activeClasses,
    archivedClasses,
    classesWithoutTeacher,
    classesWithoutCourse,
    courses,
    publishedCourses,
    lectures,
    problems,
    problemsWithoutTests,
    enrolments,
    supportTotal,
    supportLive,
  ] = await Promise.all([
    prisma.class.count({ where: { academyId } }),
    prisma.class.count({ where: activeClass }),
    prisma.class.count({ where: { academyId, status: "ARCHIVED" } }),
    prisma.class.count({
      where: {
        ...activeClass,
        // The same rule the manager's control tower applies: an assignment
        // left behind by a teacher who was suspended or demoted is not a
        // teacher. Written out rather than as a `NOT`, so the two surfaces
        // cannot drift into disagreeing about whether a class is covered.
        OR: [
          { teacherMembershipId: null },
          {
            assignedTeacher: {
              OR: [{ role: { not: "TEACHER" } }, { status: { not: "ACTIVE" } }],
            },
          },
        ],
      },
    }),
    prisma.class.count({
      where: {
        ...activeClass,
        // Visible courses only. A class assigned nothing but a hidden draft
        // has students with no work, which is the state this counts.
        courseAssignments: { none: { course: { isVisible: true } } },
      },
    }),
    prisma.course.count({ where: { academyId } }),
    prisma.course.count({ where: { academyId, isVisible: true } }),
    prisma.lecture.count({ where: { courseModule: { course: { academyId } } } }),
    prisma.material.count({
      where: { type: "PROGRAMMING_EXERCISE", ...inAcademy },
    }),
    prisma.material.count({
      where: {
        type: "PROGRAMMING_EXERCISE",
        ...inAcademy,
        // A problem that cannot grade. Either the exercise row was never
        // written, or it has no case to run — both land a student on a
        // Submit button that can only ever say nothing.
        OR: [
          { programmingExercise: { is: null } },
          { programmingExercise: { testCases: { none: {} } } },
        ],
      },
    }),
    // Enrolments, not people: one student in two classes is two seats, which
    // is what the number means to whoever sizes a campus.
    prisma.classEnrollment.count({ where: { class: { academyId } } }),
    prisma.platformSupportGrant.count({ where: { academyId } }),
    prisma.platformSupportGrant.count({
      where: {
        academyId,
        revokedAt: null,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
    }),
  ]);

  return {
    classes: {
      total: totalClasses,
      active: activeClasses,
      archived: archivedClasses,
      withoutTeacher: classesWithoutTeacher,
      withoutCourse: classesWithoutCourse,
    },
    content: {
      courses,
      publishedCourses,
      lectures,
      problems,
      problemsWithoutTests,
    },
    enrolments,
    support: { total: supportTotal, live: supportLive },
  };
}
