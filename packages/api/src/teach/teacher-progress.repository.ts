import { Injectable } from "@nestjs/common";
import {
  LONG_SOLVE_SECONDS,
  REPEATED_FAILURE_ATTEMPTS,
  STALLED_AFTER_DAYS,
} from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";
import { Prisma, type SubmissionStatus } from "../generated/prisma/client.js";
import {
  authorizedOverviewWorkPredicate,
  type OverviewAggregateScope,
} from "./teacher-overview.repository.js";

/**
 * Every database read Solution status makes, and nothing else.
 *
 * The unit owns aggregation and knows nothing about translation, oRPC errors,
 * or the attention rules themselves. It takes id lists that an authorized
 * scope already produced and returns database-shaped records, which is what
 * keeps the authorization boundary above it and the metric definitions beside
 * the shared contracts.
 *
 * Three rules hold in every query here.
 *
 * Only counted attempts — `PASSED` and `FAILED` — participate. A queued, still
 * running, cancelled, or judge-faulted submission is not something a student
 * did wrong, so it moves no total, no rate, and no attention reason.
 *
 * A submission is in scope only when its live material relation is one of the
 * exercises this class is taught *and* its frozen `source_material_id` still
 * names that same exercise. A deleted or since-hidden problem cannot walk back
 * into a teacher's view on the strength of a title an old row kept.
 *
 * Source code is selected in exactly one method. Every other query here has no
 * column that could carry it.
 *
 * See §13.2 of the teacher solution status design.
 */

export type AttemptTotals = {
  attempts: number;
  accepted: number;
  lastActivityAt: Date | null;
};

export type StudentAttemptTotals = AttemptTotals & { userId: string };
export type ExerciseAttemptTotals = AttemptTotals & {
  materialId: string;
  distinctStudents: number;
};

/**
 * The facts one attention decision needs, for one student and one exercise.
 *
 * Deliberately facts and not verdicts: `attentionReasonsFor` in `@cove/shared`
 * is the only place that decides what they mean, so the rule cannot be stated
 * once in SQL and differently in TypeScript.
 */
export type AttentionCandidate = {
  userId: string;
  materialId: string;
  consecutiveFailures: number;
  lastAttemptAt: Date;
  latestSolveSec: number | null;
  latestAccepted: boolean;
  progressStatus: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED" | null;
  revisionMatches: boolean;
};

export type ExerciseProgressRecord = {
  userId: string;
  materialId: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "SOLVED";
  bestScore: number;
  lastAttemptAt: Date | null;
  revisionMatches: boolean;
};

@Injectable()
export class TeacherProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Counted attempts per student, over the exercises in scope.
   *
   * One grouped query whatever the class size. The roster page needs three
   * numbers per student and this returns all three, so no row costs a
   * follow-up read.
   */
  async countedAttemptsByStudent(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<StudentAttemptTotals[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<StudentAttemptTotals[]>`
      SELECT
        s.user_id AS "userId",
        COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE s.status = 'PASSED')::int AS accepted,
        MAX(s.created_at) AS "lastActivityAt"
      FROM submissions s
      WHERE ${countedScope(input)}
      GROUP BY s.user_id
    `;
  }

  /** The same totals per exercise, plus how many students they came from. */
  async countedAttemptsByExercise(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<ExerciseAttemptTotals[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<ExerciseAttemptTotals[]>`
      SELECT
        s.material_id AS "materialId",
        COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE s.status = 'PASSED')::int AS accepted,
        COUNT(DISTINCT s.user_id)::int AS "distinctStudents",
        MAX(s.created_at) AS "lastActivityAt"
      FROM submissions s
      WHERE ${countedScope(input)}
      GROUP BY s.material_id
    `;
  }

  /**
   * Solved exercises per student, at the current grading revision.
   *
   * The revision join is the whole point. A progress row written against an
   * older version of the problem is not evidence that the student has solved
   * the problem as it stands now, and the learning workspace already treats it
   * as unsolved — a teacher's completion figure that disagreed with what the
   * student sees would be worse than no figure.
   */
  async solvedCountsByStudent(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<{ userId: string; solved: number }[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<{ userId: string; solved: number }[]>`
      SELECT p.user_id AS "userId", COUNT(*)::int AS solved
      FROM student_exercise_progress p
      JOIN programming_exercises e ON e.material_id = p.material_id
      WHERE ${solvedScope(input)}
      GROUP BY p.user_id
    `;
  }

  /** The same count per exercise, for the curriculum rollups. */
  async solvedCountsByExercise(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<{ materialId: string; solved: number }[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<{ materialId: string; solved: number }[]>`
      SELECT p.material_id AS "materialId", COUNT(*)::int AS solved
      FROM student_exercise_progress p
      JOIN programming_exercises e ON e.material_id = p.material_id
      WHERE ${solvedScope(input)}
      GROUP BY p.material_id
    `;
  }

  /**
   * The median measured solve time per exercise, computed in the database.
   *
   * `percentile_cont` rather than a walk over solve times in Node: the point
   * of a median here is to describe a problem across a whole class, and
   * shipping every attempt's duration to the application to sort it would make
   * the cheapest statistic on the page the most expensive query.
   *
   * Null when nothing was ever measured — attempts predating solve sessions
   * record no duration, and treating their absence as zero would report a
   * problem nobody timed as instant.
   */
  async medianSolveByExercise(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<{ materialId: string; medianSolveSec: number | null }[]> {
    if (isEmptyScope(input)) return [];
    const rows = await this.prisma.$queryRaw<
      { materialId: string; median: number | null }[]
    >`
      SELECT
        s.material_id AS "materialId",
        percentile_cont(0.5) WITHIN GROUP (ORDER BY s.solve_elapsed_sec) AS median
      FROM submissions s
      WHERE ${countedScope(input)} AND s.solve_elapsed_sec IS NOT NULL
      GROUP BY s.material_id
    `;
    return rows.map((row) => ({
      materialId: row.materialId,
      medianSolveSec: row.median === null ? null : Math.round(row.median),
    }));
  }

  /**
   * Student/exercise pairs that could currently be producing an attention
   * reason, with the numbers that would explain it.
   *
   * The `WHERE` is the disjunction of the same three thresholds the shared
   * rule uses, passed as parameters from `@cove/shared`. It can only narrow
   * the set — a pair it drops fails all three tests — so the rule itself is
   * still decided in exactly one place while the query stays proportional to
   * the students who are actually stuck rather than to the whole roster times
   * the whole curriculum.
   *
   * `consecutiveFailures` is counted as "counted attempts newer than the most
   * recent pass", which is the same thing by construction and, unlike a fixed
   * three-row window, can state a streak of nine.
   */
  async attentionCandidates(input: {
    userIds: string[];
    materialIds: string[];
    now: Date;
    /** Pair-preserving scope for the academy-wide overview. */
    overviewScope?: OverviewAggregateScope;
  }): Promise<AttentionCandidate[]> {
    if (isEmptyScope(input)) return [];
    const stalledBefore = new Date(
      input.now.getTime() - STALLED_AFTER_DAYS * 86_400_000,
    );
    return this.prisma.$queryRaw<AttentionCandidate[]>`
      WITH counted AS (
        SELECT
          s.user_id,
          s.material_id,
          s.status,
          s.solve_elapsed_sec,
          s.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY s.user_id, s.material_id
            ORDER BY s.created_at DESC, s.id DESC
          ) AS rn
        FROM submissions s
        WHERE ${
          input.overviewScope
            ? Prisma.sql`${authorizedOverviewWorkPredicate(input.overviewScope, "s")}
                AND s.source_material_id = s.material_id
                AND s.status IN ('PASSED', 'FAILED')`
            : countedScope(input)
        }
      ),
      newest_pass AS (
        SELECT user_id, material_id, MIN(rn) AS pass_rn
        FROM counted
        WHERE status = 'PASSED'
        GROUP BY user_id, material_id
      ),
      pairs AS (
        SELECT
          c.user_id,
          c.material_id,
          COUNT(*) FILTER (
            WHERE c.rn < COALESCE(np.pass_rn, 2147483647)
          )::int AS consecutive_failures,
          MAX(c.created_at) AS last_attempt_at,
          MAX(c.solve_elapsed_sec) FILTER (WHERE c.rn = 1) AS latest_solve_sec,
          bool_or(c.status = 'PASSED' AND c.rn = 1) AS latest_accepted
        FROM counted c
        LEFT JOIN newest_pass np
          ON np.user_id = c.user_id AND np.material_id = c.material_id
        GROUP BY c.user_id, c.material_id
      )
      SELECT
        pairs.user_id AS "userId",
        pairs.material_id AS "materialId",
        pairs.consecutive_failures AS "consecutiveFailures",
        pairs.last_attempt_at AS "lastAttemptAt",
        pairs.latest_solve_sec AS "latestSolveSec",
        pairs.latest_accepted AS "latestAccepted",
        prog.status::text AS "progressStatus",
        COALESCE(prog.grading_revision = e.grading_revision, false)
          AS "revisionMatches"
      FROM pairs
      JOIN programming_exercises e ON e.material_id = pairs.material_id
      LEFT JOIN student_exercise_progress prog
        ON prog.user_id = pairs.user_id AND prog.material_id = pairs.material_id
      WHERE pairs.consecutive_failures >= ${REPEATED_FAILURE_ATTEMPTS}
         OR pairs.last_attempt_at <= ${stalledBefore}
         OR (
           pairs.latest_accepted = false
           AND pairs.latest_solve_sec >= ${LONG_SOLVE_SECONDS}
         )
    `;
  }

  /**
   * Current progress rows for a set of students and exercises.
   *
   * Called only with one side of the pair narrowed — one student's curriculum,
   * or one exercise's class — so the result is bounded by the curriculum or by
   * the roster, never by their product.
   */
  async progressFor(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<ExerciseProgressRecord[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<ExerciseProgressRecord[]>`
      SELECT
        p.user_id AS "userId",
        p.material_id AS "materialId",
        p.status::text AS status,
        p.best_score AS "bestScore",
        p.last_attempt_at AS "lastAttemptAt",
        (p.grading_revision = e.grading_revision) AS "revisionMatches"
      FROM student_exercise_progress p
      JOIN programming_exercises e ON e.material_id = p.material_id
      WHERE p.user_id = ANY(ARRAY[${Prisma.join(input.userIds)}]::uuid[])
        AND p.material_id = ANY(ARRAY[${Prisma.join(input.materialIds)}]::uuid[])
    `;
  }

  /** The newest counted attempt's measured duration, per student. */
  async latestSolveByStudent(input: {
    userIds: string[];
    materialIds: string[];
  }): Promise<{ userId: string; latestSolveSec: number | null }[]> {
    if (isEmptyScope(input)) return [];
    return this.prisma.$queryRaw<
      { userId: string; latestSolveSec: number | null }[]
    >`
      SELECT DISTINCT ON (s.user_id)
        s.user_id AS "userId",
        s.solve_elapsed_sec AS "latestSolveSec"
      FROM submissions s
      WHERE ${countedScope(input)}
      ORDER BY s.user_id, s.created_at DESC, s.id DESC
    `;
  }

  /**
   * One student's attempts at one exercise, newest first.
   *
   * `createdAt DESC, id DESC` because two attempts can share a timestamp, and
   * without the tiebreak a row can appear on two pages or on neither.
   */
  async countAttempts(input: {
    userId: string;
    materialId: string;
  }): Promise<number> {
    return this.prisma.submission.count({ where: attemptWhere(input) });
  }

  async listAttempts(input: {
    userId: string;
    materialId: string;
    skip: number;
    take: number;
  }) {
    return this.prisma.submission.findMany({
      where: attemptWhere(input),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: input.skip,
      take: input.take,
      select: {
        id: true,
        status: true,
        score: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        solveElapsedSec: true,
        createdAt: true,
      },
    });
  }

  /**
   * One immutable attempt, with its code and student-visible case results.
   *
   * The only method in this file that names `code`, and it takes an already
   * resolved student and exercise: the caller has proved both belong to the
   * class before any of this is selected.
   */
  async findSubmissionForReview(input: {
    userId: string;
    materialIds: string[];
    submissionId: string;
  }) {
    if (input.materialIds.length === 0) return null;
    return this.prisma.submission.findFirst({
      where: {
        id: input.submissionId,
        userId: input.userId,
        materialId: { in: input.materialIds },
        status: { in: ["PASSED", "FAILED"] satisfies SubmissionStatus[] },
      },
      select: {
        id: true,
        materialId: true,
        sourceMaterialId: true,
        status: true,
        score: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        solveElapsedSec: true,
        createdAt: true,
        code: true,
        language: true,
        problemTitle: true,
        courseTitle: true,
        moduleTitle: true,
        lectureTitle: true,
        modulePosition: true,
        lecturePosition: true,
        problemPosition: true,
        cases: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            isSample: true,
            outcome: true,
            runtimeMs: true,
            actualOutput: true,
          },
        },
        // Sample cases only. A hidden grading case is never selected, so the
        // review contract has no hidden input or expected output to leak.
        gradingCases: {
          where: { isSample: true },
          select: { position: true, input: true, expectedOutput: true },
        },
      },
    });
  }

  /** The current statement, for context beside historical code. */
  async findStatement(materialId: string): Promise<string | null> {
    const exercise = await this.prisma.programmingExercise.findUnique({
      where: { materialId },
      select: { description: true },
    });
    return exercise?.description ?? null;
  }
}

/** One student's counted attempts at one exercise, scoped as §6.4 requires. */
function attemptWhere(input: { userId: string; materialId: string }) {
  return {
    userId: input.userId,
    materialId: input.materialId,
    sourceMaterialId: input.materialId,
    // Counted attempts only: a queued, cancelled, or judge-faulted row is not
    // something the student did, so it never appears in a history a teacher
    // reads back to them.
    status: { in: ["PASSED", "FAILED"] satisfies SubmissionStatus[] },
  } satisfies Prisma.SubmissionWhereInput;
}

/** An empty roster or curriculum answers immediately; §13.2. */
function isEmptyScope(input: {
  userIds: string[];
  materialIds: string[];
}): boolean {
  return input.userIds.length === 0 || input.materialIds.length === 0;
}

/**
 * The counted-attempt predicate, written once.
 *
 * `source_material_id = material_id` is the identity check §6.4 requires: the
 * live relation decides authorization, and the frozen id has to agree with it.
 */
function countedScope(input: {
  userIds: string[];
  materialIds: string[];
}): Prisma.Sql {
  return Prisma.sql`
    s.user_id = ANY(ARRAY[${Prisma.join(input.userIds)}]::uuid[])
    AND s.material_id = ANY(ARRAY[${Prisma.join(input.materialIds)}]::uuid[])
    AND s.source_material_id = s.material_id
    AND s.status IN ('PASSED', 'FAILED')
  `;
}

function solvedScope(input: {
  userIds: string[];
  materialIds: string[];
}): Prisma.Sql {
  return Prisma.sql`
    p.user_id = ANY(ARRAY[${Prisma.join(input.userIds)}]::uuid[])
    AND p.material_id = ANY(ARRAY[${Prisma.join(input.materialIds)}]::uuid[])
    AND p.status = 'SOLVED'
    AND p.grading_revision = e.grading_revision
  `;
}
