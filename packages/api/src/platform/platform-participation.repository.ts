import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";

/**
 * Every database read a participation card makes, and nothing else.
 *
 * §3.4 of the console people operations design draws the line this file
 * lives behind: structure and totals, never a person's own material. Nothing
 * here selects source code, a hidden test case, or a field of
 * `StudentAcademyProfile`. Every total comes from a pre-aggregated table —
 * `StudentExerciseProgress`, `StudentCourseLearningDay`, `StudentPointBalance`
 * — so no query here fans out over raw submissions (§11).
 *
 * Queries in a repository, shaping in the service — the same split
 * `TeacherOverviewRepository` keeps for the analytics surfaces this one is
 * modelled on.
 */
@Injectable()
export class PlatformParticipationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------- student */

  async studentClasses(membershipId: string) {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: { membershipId },
      select: {
        enrolledAt: true,
        class: {
          select: {
            id: true,
            name: true,
            status: true,
            assignedTeacher: {
              select: { user: { select: { displayName: true } } },
            },
            courseAssignments: {
              select: { course: { select: { id: true, title: true } } },
            },
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
    });

    return enrollments.map((enrollment) => ({
      classId: enrollment.class.id,
      name: enrollment.class.name,
      status: enrollment.class.status,
      enrolledAt: enrollment.enrolledAt,
      teacherName: enrollment.class.assignedTeacher?.user.displayName ?? null,
      courses: enrollment.class.courseAssignments.map((assignment) => ({
        courseId: assignment.course.id,
        title: assignment.course.title,
      })),
    }));
  }

  /**
   * Solved and attempted totals, per course and overall, for one user.
   *
   * "Solved" counts only a `SOLVED` row whose `grading_revision` still matches
   * the exercise's current one — the same freshness rule
   * `TeacherOverviewRepository` applies, and for the same reason: a score
   * earned against a since-changed version of a problem is not a score for
   * the problem as it stands, and the student's own workspace already treats
   * it as unsolved.
   */
  async studentExerciseTotals(input: { userId: string; courseIds: string[] }) {
    if (input.courseIds.length === 0) {
      return {
        overall: {
          solvedCount: 0,
          attemptedCount: 0,
          totalAttempts: 0,
        },
        byCourse: [] as { courseId: string; solved: number; total: number }[],
      };
    }

    const [overallRows, solvedByCourse, totalByCourse] = await Promise.all([
      this.prisma.$queryRaw<
        {
          solvedCount: number;
          attemptedCount: number;
          totalAttempts: number;
        }[]
      >`
        SELECT
          COUNT(*) FILTER (
            WHERE sep.status = 'SOLVED' AND sep.grading_revision = pe.grading_revision
          )::int AS "solvedCount",
          COUNT(*) FILTER (WHERE sep.status <> 'NOT_STARTED')::int AS "attemptedCount",
          COALESCE(SUM(sep.attempt_count), 0)::int AS "totalAttempts"
        FROM student_exercise_progress sep
        JOIN materials mat ON mat.id = sep.material_id
        JOIN lectures lec ON lec.id = mat.lecture_id
        JOIN course_modules cm ON cm.id = lec.course_module_id
        JOIN programming_exercises pe ON pe.material_id = mat.id
        WHERE sep.user_id = ${input.userId}::uuid
          AND cm.course_id = ANY(${input.courseIds}::uuid[])
      `,
      this.prisma.$queryRaw<{ courseId: string; solved: number }[]>`
        SELECT cm.course_id AS "courseId", COUNT(*)::int AS "solved"
        FROM student_exercise_progress sep
        JOIN materials mat ON mat.id = sep.material_id
        JOIN lectures lec ON lec.id = mat.lecture_id
        JOIN course_modules cm ON cm.id = lec.course_module_id
        JOIN programming_exercises pe ON pe.material_id = mat.id
        WHERE sep.user_id = ${input.userId}::uuid
          AND sep.status = 'SOLVED'
          AND sep.grading_revision = pe.grading_revision
          AND cm.course_id = ANY(${input.courseIds}::uuid[])
        GROUP BY cm.course_id
      `,
      this.prisma.$queryRaw<{ courseId: string; total: number }[]>`
        SELECT cm.course_id AS "courseId", COUNT(*)::int AS "total"
        FROM materials mat
        JOIN lectures lec ON lec.id = mat.lecture_id
        JOIN course_modules cm ON cm.id = lec.course_module_id
        WHERE mat.type = 'PROGRAMMING_EXERCISE'
          AND mat.is_visible = true
          AND lec.is_visible = true
          AND cm.course_id = ANY(${input.courseIds}::uuid[])
        GROUP BY cm.course_id
      `,
    ]);

    const solvedMap = new Map(solvedByCourse.map((row) => [row.courseId, row.solved]));
    const byCourse = totalByCourse.map((row) => ({
      courseId: row.courseId,
      total: row.total,
      solved: solvedMap.get(row.courseId) ?? 0,
    }));

    const overall = overallRows[0] ?? {
      solvedCount: 0,
      attemptedCount: 0,
      totalAttempts: 0,
    };

    return { overall, byCourse };
  }

  /** Active-time totals, per course and overall, from the daily projection. */
  async studentLearningDays(membershipId: string, courseIds: string[]) {
    if (courseIds.length === 0) {
      return {
        byCourse: [] as { courseId: string; activeSeconds: number }[],
        distinctDates: [] as string[],
      };
    }
    const [byCourse, days] = await Promise.all([
      this.prisma.studentCourseLearningDay.groupBy({
        by: ["courseId"],
        where: { membershipId, courseId: { in: courseIds } },
        _sum: { activeSeconds: true },
      }),
      this.prisma.studentCourseLearningDay.findMany({
        where: { membershipId, courseId: { in: courseIds } },
        select: { localDate: true },
        distinct: ["localDate"],
        orderBy: { localDate: "desc" },
      }),
    ]);

    return {
      byCourse: byCourse.map((row) => ({
        courseId: row.courseId,
        activeSeconds: row._sum.activeSeconds ?? 0,
      })),
      // `Date` at UTC midnight for a `@db.Date` column; formatted by the
      // service into the academy's own calendar day.
      distinctDates: days.map((day) => day.localDate.toISOString().slice(0, 10)),
    };
  }

  async studentLastActiveAt(membershipId: string): Promise<Date | null> {
    const rows = await this.prisma.classEnrollment.findMany({
      where: { membershipId, lastLearningSeenAt: { not: null } },
      select: { lastLearningSeenAt: true },
      orderBy: { lastLearningSeenAt: "desc" },
      take: 1,
    });
    return rows[0]?.lastLearningSeenAt ?? null;
  }

  async studentPoints(membershipId: string): Promise<number> {
    const balance = await this.prisma.studentPointBalance.findUnique({
      where: { membershipId },
      select: { earnedTotal: true },
    });
    return balance?.earnedTotal ?? 0;
  }

  /* -------------------------------------------------------------- teacher */

  async teacherClasses(membershipId: string) {
    const classes = await this.prisma.class.findMany({
      where: { teacherMembershipId: membershipId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        courseAssignments: {
          select: { course: { select: { id: true, title: true } } },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return classes.map((cls) => ({
      classId: cls.id,
      name: cls.name,
      status: cls.status,
      enrolledAt: cls.createdAt,
      teacherName: null as string | null,
      studentCount: cls._count.enrollments,
      courses: cls.courseAssignments.map((assignment) => ({
        courseId: assignment.course.id,
        title: assignment.course.title,
      })),
    }));
  }

  async teacherRosterReach(membershipId: string): Promise<number> {
    return this.prisma.classEnrollment.count({
      where: { class: { teacherMembershipId: membershipId, status: "ACTIVE" } },
    });
  }

  /* ----------------------------------------------------------------- lead */

  async leadCourses(academyId: string, userId: string) {
    const courses = await this.prisma.course.findMany({
      where: { academyId, createdByUserId: userId },
      select: {
        id: true,
        title: true,
        isVisible: true,
        updatedAt: true,
        _count: { select: { classAssignments: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return courses.map((course) => ({
      courseId: course.id,
      title: course.title,
      isVisible: course.isVisible,
      classCount: course._count.classAssignments,
      updatedAt: course.updatedAt,
    }));
  }

  /* -------------------------------------------------------------- manager */

  async managerScale(academyId: string) {
    const [roleRows, classRows] = await Promise.all([
      this.prisma.$queryRaw<{ role: string; status: string; total: number }[]>`
        SELECT m.role::text AS "role", m.status::text AS "status", COUNT(*)::int AS "total"
        FROM academy_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.academy_id = ${academyId}::uuid
          AND m.status IN ('ACTIVE', 'SUSPENDED')
          AND u.status <> 'DELETED'
        GROUP BY m.role, m.status
      `,
      this.prisma.$queryRaw<{ active: number; archived: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "active",
          COUNT(*) FILTER (WHERE status <> 'ACTIVE')::int AS "archived"
        FROM classes
        WHERE academy_id = ${academyId}::uuid
      `,
    ]);
    const active = (role: string) =>
      roleRows.find((row) => row.role === role && row.status === "ACTIVE")
        ?.total ?? 0;
    const students = active("STUDENT");
    const teachers = active("TEACHER");
    const teamLeads = active("TEAM_LEAD");
    const managers = active("MANAGER");
    const classes = classRows[0] ?? { active: 0, archived: 0 };

    return {
      students,
      teachers,
      teamLeads,
      managers,
      activeMembers: students + teachers + teamLeads + managers,
      suspendedMembers: roleRows
        .filter((row) => row.status === "SUSPENDED")
        .reduce((total, row) => total + row.total, 0),
      activeClasses: classes.active,
      archivedClasses: classes.archived,
    };
  }

  async managerCounts(academyId: string) {
    const [classCount, courseCount] = await Promise.all([
      this.prisma.class.count({ where: { academyId, status: "ACTIVE" } }),
      this.prisma.course.count({ where: { academyId } }),
    ]);
    return { classCount, courseCount };
  }
}
