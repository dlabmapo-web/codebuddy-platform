import { Injectable } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";

/**
 * The reads one student's own overview makes.
 *
 * Every predicate here is anchored to one user or one membership, and every
 * one of them takes the authorized material and course lists the access
 * service resolved. There is no method that can be called with a wider scope
 * than the caller was granted, because there is no method that resolves its
 * own scope.
 *
 * The counted-attempt and counted-time definitions are the teacher's,
 * deliberately: `source_material_id = material_id`, `PASSED`/`FAILED` only, and
 * a grading-revision join so only work graded the way the problem grades today
 * counts toward today's score. A second definition of "a counted attempt"
 * living here is exactly how a student's average and their teacher's would come
 * to disagree about the same week.
 *
 * Aggregates run in PostgreSQL. §13 gives the whole page a second at two
 * thousand submissions, and counting rows in Node would spend it on the
 * cheapest figure on the page.
 *
 * See §8 and §11 of the student academy overview design.
 */

export type Period = { startAt: string | null; endAt: string };
export type Window = { startDate: string | null; endDate: string };

export type StudentWorkTotals = {
  submissions: number;
  passed: number;
  attemptedProblems: number;
  solvedProblems: number;
  scoreSum: number;
};

export type ActivityDayRow = {
  date: Date;
  activeSeconds: number;
  intervals: number;
};

export type SubmissionDayRow = {
  date: string;
  submissions: number;
  solved: number;
};

export type StandingWorkRow = {
  membershipId: string;
  solvedProblems: number;
  attemptedProblems: number;
  scoreSum: number;
};

export type RecordRow = {
  id: string;
  materialId: string | null;
  problemTitle: string;
  courseTitle: string;
  status: string;
  score: number;
  solveElapsedSec: number | null;
  createdAt: Date;
};

@Injectable()
export class StudentOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ work */

  /**
   * The student's period work, in one pass.
   *
   * `scoreSum` sums each attempted problem's best score *inside the period*, so
   * dividing by `attemptedProblems` is the score definition the teacher's page
   * uses. Taking the best per problem rather than the mean of every attempt is
   * the difference between "how well do they understand this" and "how many
   * times did they guess".
   */
  async work(input: {
    userId: string;
    materialIds: string[];
    period: Period;
  }): Promise<StudentWorkTotals> {
    if (input.materialIds.length === 0) return emptyWork();
    const [row] = await this.prisma.$queryRaw<StudentWorkTotals[]>`
      WITH pairs AS (
        SELECT
          s.material_id,
          MAX(s.score)::int AS best_score,
          COUNT(*)::int AS attempts,
          COUNT(*) FILTER (WHERE s.status = 'PASSED')::int AS passes,
          bool_or(s.status = 'PASSED') AS solved
        FROM submissions s
        WHERE ${countedScope(input)}
        GROUP BY s.material_id
      )
      SELECT
        COALESCE(SUM(pairs.attempts), 0)::int AS submissions,
        COALESCE(SUM(pairs.passes), 0)::int AS passed,
        COUNT(*)::int AS "attemptedProblems",
        COUNT(*) FILTER (WHERE pairs.solved)::int AS "solvedProblems",
        COALESCE(SUM(pairs.best_score), 0)::int AS "scoreSum"
      FROM pairs
    `;
    return row ?? emptyWork();
  }

  /* -------------------------------------------------------------- activity */

  /**
   * Counted time per academy-local day, for the chart and the totals both.
   *
   * Grouped by date rather than summed, because the same afternoon spent
   * across two courses is one active day and adding per-course day counts
   * would tell a student they showed up twice.
   */
  async activityByDay(input: {
    membershipId: string;
    courseIds: string[];
    window: Window;
  }): Promise<ActivityDayRow[]> {
    if (input.courseIds.length === 0) return [];
    return this.prisma.$queryRaw<ActivityDayRow[]>`
      SELECT
        d.local_date AS "date",
        SUM(d.active_seconds)::int AS "activeSeconds",
        SUM(d.active_intervals)::int AS "intervals"
      FROM student_course_learning_days d
      WHERE ${activityScope(input)}
      GROUP BY d.local_date
      ORDER BY d.local_date ASC
    `;
  }

  /** The student's first counted day, so the page can say what it cannot know. */
  async activityTrackedSince(membershipId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<{ since: Date | null }[]>`
      SELECT MIN(d.local_date) AS since
      FROM student_course_learning_days d
      WHERE d.membership_id = ${membershipId}::uuid
    `;
    const since = rows[0]?.since ?? null;
    return since ? isoDate(since) : null;
  }

  /**
   * Counted attempts and solves per academy-local day.
   *
   * The second series of the activity chart. Local rather than UTC for the
   * same reason the projection is: an evening lesson must not be split across
   * two dates on a student's own history.
   */
  async submissionsByDay(input: {
    userId: string;
    materialIds: string[];
    period: Period;
    timeZone: string;
  }): Promise<SubmissionDayRow[]> {
    if (input.materialIds.length === 0) return [];
    return this.prisma.$queryRaw<SubmissionDayRow[]>`
      SELECT
        to_char((s.created_at AT TIME ZONE ${input.timeZone})::date, 'YYYY-MM-DD') AS "date",
        COUNT(*)::int AS submissions,
        COUNT(DISTINCT s.material_id) FILTER (WHERE s.status = 'PASSED')::int AS solved
      FROM submissions s
      WHERE ${countedScope(input)}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  /* --------------------------------------------------------------- records */

  /** The newest counted attempts, with the labels they were written under. */
  async recentRecords(input: {
    userId: string;
    materialIds: string[];
    limit: number;
  }): Promise<RecordRow[]> {
    if (input.materialIds.length === 0) return [];
    return this.prisma.$queryRaw<RecordRow[]>`
      SELECT
        s.id,
        s.material_id AS "materialId",
        s.problem_title AS "problemTitle",
        s.course_title AS "courseTitle",
        s.status::text AS status,
        s.score,
        s.solve_elapsed_sec AS "solveElapsedSec",
        s.created_at AS "createdAt"
      FROM submissions s
      WHERE s.user_id = ${input.userId}::uuid
        AND s.material_id = ANY(${input.materialIds}::uuid[])
        AND s.source_material_id = s.material_id
        AND s.status IN ('PASSED', 'FAILED')
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${input.limit}
    `;
  }

  /* -------------------------------------------------------------- standing */

  /**
   * The class's period work, one row per enrolled student.
   *
   * The only class-wide aggregate on the page, and the only place a membership
   * id other than the caller's is ever read. It is grouped and bounded before
   * it leaves PostgreSQL, and §9.1's row schema has nowhere to put an
   * identifier, so the ordered class never reaches the browser in any form.
   *
   * The score definition is the same one the caller's own ledger uses. A
   * standing computed from a different definition than the number printed
   * above it would be indefensible.
   */
  async standingWork(input: {
    membershipIds: string[];
    materialIds: string[];
    period: Period;
  }): Promise<StandingWorkRow[]> {
    if (input.membershipIds.length === 0 || input.materialIds.length === 0) {
      return [];
    }
    return this.prisma.$queryRaw<StandingWorkRow[]>`
      WITH roster AS (
        SELECT m.id AS membership_id, m.user_id
        FROM academy_memberships m
        WHERE m.id = ANY(${input.membershipIds}::uuid[])
          AND m.status = 'ACTIVE'
          AND m.role = 'STUDENT'
      ),
      pairs AS (
        SELECT
          r.membership_id,
          s.material_id,
          MAX(s.score)::int AS best_score,
          bool_or(s.status = 'PASSED') AS solved
        FROM submissions s
        JOIN roster r ON r.user_id = s.user_id
        WHERE s.material_id = ANY(${input.materialIds}::uuid[])
          AND s.source_material_id = s.material_id
          AND s.status IN ('PASSED', 'FAILED')
          ${periodBounds(input.period)}
          AND EXISTS (
            SELECT 1 FROM programming_exercises e
            WHERE e.material_id = s.material_id
              AND e.grading_revision = s.grading_revision
          )
        GROUP BY r.membership_id, s.material_id
      )
      SELECT
        roster.membership_id AS "membershipId",
        COUNT(pairs.material_id) FILTER (WHERE pairs.solved)::int AS "solvedProblems",
        COUNT(pairs.material_id)::int AS "attemptedProblems",
        COALESCE(SUM(pairs.best_score), 0)::int AS "scoreSum"
      FROM roster
      LEFT JOIN pairs ON pairs.membership_id = roster.membership_id
      GROUP BY roster.membership_id
    `;
  }

  /** Distinct counted days per class member, the standing's third key. */
  async standingActiveDays(input: {
    membershipIds: string[];
    courseIds: string[];
    window: Window;
  }): Promise<{ membershipId: string; activeDays: number }[]> {
    if (input.membershipIds.length === 0 || input.courseIds.length === 0) {
      return [];
    }
    const from = input.window.startDate
      ? Prisma.sql`AND d.local_date >= ${input.window.startDate}::date`
      : Prisma.empty;
    return this.prisma.$queryRaw<
      { membershipId: string; activeDays: number }[]
    >`
      SELECT
        d.membership_id AS "membershipId",
        COUNT(DISTINCT d.local_date)::int AS "activeDays"
      FROM student_course_learning_days d
      WHERE d.membership_id = ANY(${input.membershipIds}::uuid[])
        AND d.course_id = ANY(${input.courseIds}::uuid[])
        ${from}
        AND d.local_date <= ${input.window.endDate}::date
      GROUP BY d.membership_id
    `;
  }
}

/* ------------------------------------------------------------- predicates */

/**
 * A counted attempt, stated once.
 *
 * `source_material_id = material_id` is the identity check: the live relation
 * decides authorization, and the frozen id has to agree with it. The revision
 * join is the currency check: only work graded the way the problem grades
 * today counts toward today's score.
 */
function countedScope(input: {
  userId: string;
  materialIds: string[];
  period: Period;
}): Prisma.Sql {
  return Prisma.sql`
    s.user_id = ${input.userId}::uuid
    AND s.material_id = ANY(${input.materialIds}::uuid[])
    AND s.source_material_id = s.material_id
    AND s.status IN ('PASSED', 'FAILED')
    ${periodBounds(input.period)}
    AND EXISTS (
      SELECT 1 FROM programming_exercises e
      WHERE e.material_id = s.material_id
        AND e.grading_revision = s.grading_revision
    )
  `;
}

function periodBounds(period: Period): Prisma.Sql {
  const from = period.startAt
    ? Prisma.sql`AND s.created_at >= ${period.startAt}`
    : Prisma.empty;
  return Prisma.sql`${from} AND s.created_at < ${period.endAt}`;
}

function activityScope(input: {
  membershipId: string;
  courseIds: string[];
  window: Window;
}): Prisma.Sql {
  const from = input.window.startDate
    ? Prisma.sql`AND d.local_date >= ${input.window.startDate}::date`
    : Prisma.empty;
  return Prisma.sql`
    d.membership_id = ${input.membershipId}::uuid
    AND d.course_id = ANY(${input.courseIds}::uuid[])
    ${from}
    AND d.local_date <= ${input.window.endDate}::date
  `;
}

function emptyWork(): StudentWorkTotals {
  return {
    submissions: 0,
    passed: 0,
    attemptedProblems: 0,
    solvedProblems: 0,
    scoreSum: 0,
  };
}

/** A `date` column as the academy-local calendar date it already is. */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
