import type { PlatformAcademyDetail } from "@cove/shared";

import type { PrismaService } from "../database/prisma.service.js";
import { contentStatPredicates } from "./content-stat-predicates.js";

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
  const stats = contentStatPredicates([academyId]);

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
    prisma.class.count({ where: stats.activeClass }),
    prisma.class.count({ where: { academyId, status: "ARCHIVED" } }),
    // An assignment left behind by a teacher who was suspended or demoted is
    // not coverage. Shared with the platform summary so the surfaces agree.
    prisma.class.count({ where: stats.classWithoutTeacher }),
    prisma.class.count({
      where: {
        ...stats.activeClass,
        // Visible courses only. A class assigned nothing but a hidden draft
        // has students with no work, which is the state this counts.
        courseAssignments: { none: { course: { isVisible: true } } },
      },
    }),
    prisma.course.count({ where: { academyId } }),
    prisma.course.count({ where: stats.publishedCourse }),
    prisma.lecture.count({ where: { courseModule: { course: { academyId } } } }),
    prisma.material.count({
      where: stats.problem,
    }),
    // Missing exercise metadata or no cases both mean the problem cannot
    // grade. Shared with the platform summary for the same reason.
    prisma.material.count({ where: stats.problemWithoutTests }),
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
