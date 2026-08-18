import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * Every database read the teacher analytics surfaces make, and nothing else.
 *
 * Four rules hold in every query here.
 *
 * Aggregation happens in PostgreSQL. The pages describe up to 250 students
 * against two years of submissions; shipping those rows to Node to count them
 * would make the cheapest number on the page the most expensive query, and
 * §10.2 rules it out explicitly.
 *
 * Only counted attempts — `PASSED` and `FAILED` — participate. A queued, still
 * running, cancelled, or judge-faulted submission is not something a student
 * did, so it moves no total, no rate, and no chart.
 *
 * A submission is in scope only when its live material relation is one of the
 * exercises these classes are taught, its frozen `source_material_id` still
 * names that same exercise, and its `grading_revision` is the one the problem
 * currently grades at. A since-hidden problem cannot walk back into a teacher's
 * view on the strength of a title an old row kept, and a score earned against
 * an older version of a problem is not a score for the problem as it stands —
 * the learning workspace already treats it as unsolved, and an analytics page
 * that disagreed with what the student sees would be worse than none.
 *
 * Nothing here selects source code, a hidden test case, an email, an auth id,
 * or feedback text. There is no column in any result that could carry one.
 *
 * See §10.2 and §11 of the teacher overview and student analytics redesign.
 */

export type StudentActivityTotals = {
  membershipId: string;
  courseId: string;
  activeSeconds: number;
  activeDays: number;
  lastActiveAt: Date;
};

export type StudentWorkTotals = {
  userId: string;
  submissions: number;
  attemptedProblems: number;
  solvedProblems: number;
  scoreSum: number;
  lastSubmissionAt: Date;
};

export type StudentMaterialWorkTotals = {
  userId: string;
  materialId: string;
  submissions: number;
  solved: boolean;
  bestScore: number;
  lastSubmissionAt: Date;
};

export type LectureSolvedRow = {
  lectureId: string;
  userId: string;
  solved: number;
  attempted: number;
};

export type ProblemDifficultyRow = {
  materialId: string;
  attemptingStudents: number;
  solvedStudents: number;
  submissions: number;
};

export type OverviewAggregateScope = {
  studentClasses: {
    classId: string;
    userId: string;
    membershipId: string;
  }[];
  materialClasses: {
    classId: string;
    courseId: string;
    materialId: string;
  }[];
};
type Scope = OverviewAggregateScope;
type Period = { startAt: Date | null; endAt: Date };
type Window = { startDate: string | null; endDate: string };

@Injectable()
export class TeacherOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------- active learning time */

  /**
   * Counted seconds per student and course, over the period's local days.
   *
   * Grouped by course rather than summed flat because a class may only count
   * the courses assigned to it: the caller decides which of a student's
   * courses each total is allowed to include, and the academy-wide figure sums
   * the same student-course pairs exactly once however many selected classes
   * share them — §6.4.
   */
  async activityByStudentCourse(input: {
    scope: Scope;
    startDate: string | null;
    endDate: string;
  }): Promise<StudentActivityTotals[]> {
    if (isEmptyScope(input.scope)) return [];
    return this.prisma.$queryRaw<StudentActivityTotals[]>`
      SELECT
        d.membership_id AS "membershipId",
        d.course_id AS "courseId",
        SUM(d.active_seconds)::int AS "activeSeconds",
        COUNT(DISTINCT d.local_date)::int AS "activeDays",
        MAX(d.last_active_at) AS "lastActiveAt"
      FROM student_course_learning_days d
      WHERE ${activityScope(input.scope, input)}
      GROUP BY d.membership_id, d.course_id
    `;
  }

  /**
   * Distinct active days per student, across every course in scope.
   *
   * A second query rather than a sum over the one above: a student who worked
   * on two courses on the same afternoon has one active day, and adding the
   * per-course day counts would tell their teacher they showed up twice.
   */
  async activityDaysByStudent(input: {
    scope: Scope;
    startDate: string | null;
    endDate: string;
  }): Promise<{ membershipId: string; activeDays: number }[]> {
    if (isEmptyScope(input.scope)) return [];
    return this.prisma.$queryRaw<
      { membershipId: string; activeDays: number }[]
    >`
      SELECT
        d.membership_id AS "membershipId",
        COUNT(DISTINCT d.local_date)::int AS "activeDays"
      FROM student_course_learning_days d
      WHERE ${activityScope(input.scope, input)}
      GROUP BY d.membership_id
    `;
  }

  /**
   * §6.4's Active days: calendar dates on which *anyone* in scope worked.
   *
   * A property of the cohort rather than of a student. Ten students active on
   * the same Tuesday is one active day, which is what makes the number readable
   * as "the class met and worked on this many days".
   */
  async activeCalendarDays(input: {
    scope: Scope;
    startDate: string | null;
    endDate: string;
  }): Promise<number> {
    if (isEmptyScope(input.scope)) return 0;
    const rows = await this.prisma.$queryRaw<{ days: number }[]>`
      SELECT COUNT(DISTINCT d.local_date)::int AS days
      FROM student_course_learning_days d
      WHERE ${activityScope(input.scope, input)}
    `;
    return rows[0]?.days ?? 0;
  }

  /**
   * The first local date this academy ever recorded activity for.
   *
   * §5.3 — activity time begins when the projection ships. The interface says
   * so rather than presenting an honest absence as a decline, and nothing
   * reconstructs older time from submission timestamps.
   */
  async activityTrackedSince(academyId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ since: Date | null }[]>`
      SELECT MIN(d.local_date) AS since
      FROM student_course_learning_days d
      WHERE d.academy_id = ${academyId}::uuid
    `;
    const since = rows[0]?.since ?? null;
    return since ? since.toISOString().slice(0, 10) : null;
  }

  /* ---------------------------------------------------------------- work */

  /**
   * One row per student: what they submitted, what it scored, what it solved.
   *
   * `scoreSum` is the sum of each attempted problem's best score *inside the
   * period*, so dividing by `attemptedProblems` is §7.4's average best score.
   * Taking the best per problem rather than the mean of every attempt is the
   * difference between "how well do they understand this" and "how many times
   * did they guess"; taking it from the period rather than from lifetime state
   * is what keeps the date filter honest — a score earned months ago must not
   * appear as a seven-day result merely because it remains the student's best.
   *
   * `solvedProblems` counts distinct problems with at least one passing
   * submission in the period, which is the definition §6.5 gives the
   * participation chart. An old solve with no work in the period is not new
   * participation and does not appear as any.
   */
  async workByStudent(
    scope: Scope,
    period: Period,
  ): Promise<StudentWorkTotals[]> {
    if (isEmptyScope(scope)) return [];
    return this.prisma.$queryRaw<StudentWorkTotals[]>`
      WITH pairs AS (
        SELECT
          s.user_id,
          s.material_id,
          MAX(s.score)::int AS best_score,
          COUNT(*)::int AS attempts,
          bool_or(s.status = 'PASSED') AS solved,
          MAX(s.created_at) AS last_at
        FROM submissions s
        WHERE ${countedScope(scope, period)}
        GROUP BY s.user_id, s.material_id
      )
      SELECT
        pairs.user_id AS "userId",
        SUM(pairs.attempts)::int AS submissions,
        COUNT(*)::int AS "attemptedProblems",
        COUNT(*) FILTER (WHERE pairs.solved)::int AS "solvedProblems",
        SUM(pairs.best_score)::int AS "scoreSum",
        MAX(pairs.last_at) AS "lastSubmissionAt"
      FROM pairs
      GROUP BY pairs.user_id
    `;
  }

  /** One period-scoped row per student/exercise for class-local comparisons. */
  async workByStudentMaterial(
    scope: Scope,
    period: Period,
  ): Promise<StudentMaterialWorkTotals[]> {
    if (isEmptyScope(scope)) return [];
    return this.prisma.$queryRaw<StudentMaterialWorkTotals[]>`
      SELECT
        s.user_id AS "userId",
        s.material_id AS "materialId",
        COUNT(*)::int AS submissions,
        bool_or(s.status = 'PASSED') AS solved,
        MAX(s.score)::int AS "bestScore",
        MAX(s.created_at) AS "lastSubmissionAt"
      FROM submissions s
      WHERE ${countedScope(scope, period)}
      GROUP BY s.user_id, s.material_id
    `;
  }

  /* ------------------------------------------------------------ curriculum */

  /**
   * Solved and attempted exercises per lecture and student, as of now.
   *
   * §6.8 — readiness describes present cumulative progress, not work created
   * inside the selected date range, so this is deliberately not period-scoped.
   * The UI states that exception beside the section title rather than letting a
   * seven-day filter silently rewrite what the class is ready for.
   *
   * `attempted` comes from `attempt_count` rather than from the solved count,
   * so a lecture every student has tried and nobody has finished is visibly
   * different from one nobody has opened.
   */
  async lectureProgressByStudent(scope: Scope): Promise<LectureSolvedRow[]> {
    if (isEmptyScope(scope)) return [];
    return this.prisma.$queryRaw<LectureSolvedRow[]>`
      SELECT
        m.lecture_id AS "lectureId",
        p.user_id AS "userId",
        COUNT(*) FILTER (
          WHERE p.status = 'SOLVED' AND p.grading_revision = e.grading_revision
        )::int AS solved,
        COUNT(*) FILTER (WHERE p.attempt_count > 0)::int AS attempted
      FROM student_exercise_progress p
      JOIN materials m ON m.id = p.material_id
      JOIN programming_exercises e ON e.material_id = p.material_id
      WHERE ${authorizedOverviewWorkPredicate(scope, "p")}
      GROUP BY m.lecture_id, p.user_id
    `;
  }

  /* ------------------------------------------------------------- problems */

  /**
   * What a problem cost the students who tried it, in the period.
   *
   * `attemptingStudents` counts distinct students and `submissions` counts
   * attempts, so §6.9's rule holds by construction: one child retrying twenty
   * times raises the volume and never the denominator, and cannot make a
   * problem look harder than one twenty children each failed once.
   */
  async problemDifficulty(
    scope: Scope,
    period: Period,
  ): Promise<ProblemDifficultyRow[]> {
    if (isEmptyScope(scope)) return [];
    return this.prisma.$queryRaw<ProblemDifficultyRow[]>`
      SELECT
        s.material_id AS "materialId",
        COUNT(DISTINCT s.user_id)::int AS "attemptingStudents",
        COUNT(DISTINCT s.user_id) FILTER (WHERE s.status = 'PASSED')::int
          AS "solvedStudents",
        COUNT(*)::int AS submissions
      FROM submissions s
      WHERE ${countedScope(scope, period)}
      GROUP BY s.material_id
    `;
  }
}

/** An empty roster or curriculum answers immediately. */
function isEmptyScope(scope: Scope): boolean {
  return scope.studentClasses.length === 0 || scope.materialClasses.length === 0;
}

/**
 * The counted-attempt predicate, written once.
 *
 * `source_material_id = material_id` is the identity check: the live relation
 * decides authorization, and the frozen id has to agree with it. The revision
 * join is the currency check: only work graded the way the problem grades today
 * counts toward today's score.
 */
function countedScope(scope: Scope, period: Period): Prisma.Sql {
  return Prisma.sql`
    ${authorizedOverviewWorkPredicate(scope, "s")}
    AND ${countedAttemptPredicate(period)}
    AND EXISTS (
      SELECT 1 FROM programming_exercises e
      WHERE e.material_id = s.material_id
        AND e.grading_revision = s.grading_revision
    )
  `;
}

function activityScope(scope: Scope, input: Window): Prisma.Sql {
  const from = input.startDate
    ? Prisma.sql`AND d.local_date >= ${input.startDate}::date`
    : Prisma.empty;
  return Prisma.sql`
    EXISTS (
      SELECT 1 FROM (${authorizedActivityPairs(scope)}) authorized
      WHERE authorized.membership_id = d.membership_id
        AND authorized.course_id = d.course_id
    )
    ${from}
    AND d.local_date <= ${input.endDate}::date
  `;
}

function countedAttemptPredicate(period: Period): Prisma.Sql {
  const from = period.startAt
    ? Prisma.sql`AND s.created_at >= ${period.startAt}`
    : Prisma.empty;
  return Prisma.sql`
    s.source_material_id = s.material_id
    AND s.status IN ('PASSED', 'FAILED')
    ${from}
    AND s.created_at < ${period.endAt}
  `;
}

/**
 * §11's pair-preserving predicate.
 *
 * The join is what makes it correct: a student is paired with the materials of
 * the classes *they* are in, never with the union of every material in scope.
 * Two independent `IN (...)` sets would let a student's work on one class's
 * course appear inside a class that never taught it.
 */
export function authorizedOverviewWorkPredicate(
  scope: Scope,
  alias: "s" | "p",
): Prisma.Sql {
  const row = alias === "s" ? Prisma.sql`s` : Prisma.sql`p`;
  return Prisma.sql`
    EXISTS (
      SELECT 1 FROM (${authorizedWorkPairs(scope)}) authorized
      WHERE authorized.user_id = ${row}.user_id
        AND authorized.material_id = ${row}.material_id
    )
  `;
}

function authorizedWorkPairs(scope: Scope): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT students.user_id, materials.material_id
    FROM (${studentClassRows(scope)}) students
    JOIN (${materialClassRows(scope)}) materials USING (class_id)
  `;
}

function authorizedActivityPairs(scope: Scope): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT students.membership_id, materials.course_id
    FROM (${studentClassRows(scope)}) students
    JOIN (${materialClassRows(scope)}) materials USING (class_id)
  `;
}

function studentClassRows(scope: Scope): Prisma.Sql {
  return Prisma.sql`
    SELECT values.class_id, values.user_id, values.membership_id
    FROM (VALUES ${Prisma.join(
      scope.studentClasses.map((row) =>
        Prisma.sql`(${row.classId}::uuid, ${row.userId}::uuid, ${row.membershipId}::uuid)`,
      ),
    )}) AS values(class_id, user_id, membership_id)
  `;
}

function materialClassRows(scope: Scope): Prisma.Sql {
  return Prisma.sql`
    SELECT values.class_id, values.course_id, values.material_id
    FROM (VALUES ${Prisma.join(
      scope.materialClasses.map((row) =>
        Prisma.sql`(${row.classId}::uuid, ${row.courseId}::uuid, ${row.materialId}::uuid)`,
      ),
    )}) AS values(class_id, course_id, material_id)
  `;
}
