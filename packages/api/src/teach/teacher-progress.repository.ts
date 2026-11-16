import { Injectable } from "@nestjs/common";
import {
  type ReadingMaterialRow, type ReadingMaterialStudentsInput, type ReadingMaterialStudentsResult,
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

  /** One statement, including ready-asset and all-ancestor visibility checks. */
  async readingMaterials(input: { courseId: string; userIds: string[]; classId: string }): Promise<ReadingMaterialRow[]> {
    return this.prisma.$queryRaw<ReadingMaterialRow[]>`
      WITH ${readingCompletions(input)}
      SELECT m.id AS "materialId", m.title, m.type::text AS type, m.position,
        l.id AS "lectureId", l.title AS "lectureTitle", l.position AS "lecturePosition", cm.position AS "modulePosition",
        COUNT(DISTINCT done.user_id)::int AS viewed, ${input.userIds.length}::int AS total
      FROM materials m JOIN lectures l ON l.id = m.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id
      LEFT JOIN pdf_documents pdf ON pdf.material_id = m.id LEFT JOIN pdf_assets pa ON pa.id = pdf.asset_id
      LEFT JOIN video_lessons video ON video.material_id = m.id LEFT JOIN video_assets va ON va.id = video.asset_id
      LEFT JOIN done ON done.material_id = m.id
      WHERE cm.course_id = ${input.courseId}::uuid AND cm.is_visible AND l.is_visible AND m.is_visible
        AND (m.type IN ('EXPLANATION', 'MULTIPLE_CHOICE', 'WRITTEN_RESPONSE')
          OR (m.type = 'PDF_DOCUMENT' AND pdf.placement <> 'SUPPLEMENTARY' AND pa.state = 'READY') OR (m.type = 'VIDEO_LESSON' AND video.placement <> 'SUPPLEMENTARY' AND va.state = 'READY'))
      GROUP BY m.id, l.id, cm.id ORDER BY cm.position, l.position, m.position, m.id`;
  }
  /** One grouped completion/activity read for the whole roster. */
  async readingStudents(input: { materialIds: string[]; userIds: string[]; classId: string }) {
    return this.prisma.$queryRaw<Array<{ userId: string; viewed: number; lastActivityAt: Date | null }>>`
      WITH ${readingCompletions(input)}
      SELECT user_id AS "userId", COUNT(DISTINCT material_id)::int AS viewed, MAX(at) AS "lastActivityAt"
      FROM done WHERE material_id = ANY(${input.materialIds}::uuid[]) GROUP BY user_id`;
  }
  /** The latest attempt is the same attempt used by manual quiz reports. */
  async readingQuizzes(input: { materialIds: string[]; userIds: string[]; classId: string }) {
    if (!input.materialIds.length) return [];
    return this.prisma.$queryRaw<Array<{ userId: string; correct: number; lastActivityAt: Date | null }>>`
      WITH latest AS (SELECT DISTINCT ON (s.user_id, s.material_id) s.user_id, s.created_at, COALESCE(r.completed, CASE WHEN a.status = 'GRADED' THEN a.completed END) AS completed, COALESCE(r.score_hundredths, CASE WHEN a.status = 'GRADED' THEN a.score_hundredths END) AS score_hundredths, s.maximum_hundredths
        FROM manual_submissions s LEFT JOIN multiple_choice_assessments a ON a.submission_id = s.id
    LEFT JOIN LATERAL (SELECT completed, score_hundredths FROM manual_reviews r WHERE r.submission_id = s.id ORDER BY version DESC LIMIT 1) r ON true
        WHERE s.class_id = ${input.classId}::uuid AND s.user_id = ANY(${input.userIds}::uuid[]) AND s.material_id = ANY(${input.materialIds}::uuid[])
        ORDER BY s.user_id, s.material_id, s.created_at DESC, s.id DESC)
      SELECT user_id AS "userId", COUNT(*) FILTER (WHERE completed AND score_hundredths = maximum_hundredths)::int AS correct, MAX(created_at) AS "lastActivityAt" FROM latest GROUP BY user_id`;
  }
  /** One paged statement, including a total even when the page is empty. */
  async readingMaterialStudents(input: ReadingMaterialStudentsInput & { courseIds: string[]; students: Array<{ membershipId: string; userId: string; displayName: string }> }): Promise<Pick<ReadingMaterialStudentsResult, "title" | "total" | "rows"> | null> {
    const [result] = await this.prisma.$queryRaw<Array<Pick<ReadingMaterialStudentsResult, "title" | "total" | "rows">>>`
      WITH target AS (
        SELECT m.title FROM materials m JOIN lectures l ON l.id = m.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id
        LEFT JOIN pdf_documents p ON p.material_id = m.id LEFT JOIN pdf_assets a ON a.id = p.asset_id
        WHERE m.id = ${input.materialId}::uuid AND cm.course_id = ANY(${input.courseIds}::uuid[]) AND cm.is_visible AND l.is_visible AND m.is_visible
          AND (m.type = 'EXPLANATION' OR (m.type = 'PDF_DOCUMENT' AND p.placement <> 'SUPPLEMENTARY' AND a.state = 'READY'))
      ), filtered AS (
        SELECT s."membershipId", s."displayName", v.first_viewed_at AS "firstViewedAt"
        FROM jsonb_to_recordset(${JSON.stringify(input.students)}::jsonb) AS s("membershipId" text, "userId" text, "displayName" text)
        LEFT JOIN student_material_views v ON v.user_id = s."userId"::uuid AND v.material_id = ${input.materialId}::uuid
        WHERE POSITION(LOWER(${input.q}) IN LOWER(s."displayName")) > 0
          AND (${input.filter} = 'all' OR (${input.filter} = 'viewed' AND v.user_id IS NOT NULL) OR (${input.filter} = 'notViewed' AND v.user_id IS NULL))
      ), paged AS (SELECT * FROM filtered ORDER BY "displayName", "membershipId" LIMIT 25 OFFSET ${(input.page - 1) * 25})
      SELECT target.title, (SELECT COUNT(*)::int FROM filtered) AS total, COALESCE((SELECT jsonb_agg(paged) FROM paged), '[]'::jsonb) AS rows FROM target`;
    return result ?? null;
  }

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
      -- Find the newest passing attempt once per pair. Joining a separately
      -- grouped copy of counted can make PostgreSQL recompute that aggregate
      -- for every attempt, turning the shared attention read quadratic.
      attempts_with_pass AS (
        SELECT *, MIN(rn) FILTER (WHERE status = 'PASSED') OVER (
          PARTITION BY user_id, material_id
        ) AS pass_rn
        FROM counted
      ),
      pairs AS (
        SELECT
          c.user_id,
          c.material_id,
          COUNT(*) FILTER (
            WHERE c.rn < COALESCE(c.pass_rn, 2147483647)
          )::int AS consecutive_failures,
          MAX(c.created_at) AS last_attempt_at,
          MAX(c.solve_elapsed_sec) FILTER (WHERE c.rn = 1) AS latest_solve_sec,
          bool_or(c.status = 'PASSED' AND c.rn = 1) AS latest_accepted
        FROM attempts_with_pass c
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
    classId?: string;
  }): Promise<number> {
    return this.prisma.submission.count({ where: attemptWhere(input) });
  }

  async listAttempts(input: {
    userId: string;
    materialId: string;
    classId?: string;
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
        submissionPolicy: true, manualAssessmentSnapshot: true, manualReviewResult: true,
        score: true,
        earnedWeight: true,
        possibleWeight: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        solveElapsedSec: true,
        createdAt: true,
        compileFailed: true,
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
    classId?: string;
  }) {
    if (input.materialIds.length === 0) return null;
    return this.prisma.submission.findFirst({
      where: {
        id: input.submissionId,
        ...(input.classId ? {classId: input.classId} : {}),
        userId: input.userId,
        materialId: { in: input.materialIds },
        status: { in: ["PASSED", "FAILED", "RECORDED"] satisfies SubmissionStatus[] },
      },
      select: {
        id: true,
        materialId: true,
        sourceMaterialId: true,
        status: true,
        submissionPolicy: true, manualAssessmentSnapshot: true, manualReviewResult: true,
        score: true,
        earnedWeight: true,
        possibleWeight: true,
        passedCount: true,
        totalCount: true,
        runtimeMs: true,
        solveElapsedSec: true,
        createdAt: true,
        quizSnapshot: true,
        code: true,
        language: true,
        compileFailed: true,
        compileDiagnostics: true,
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
            exitCode: true,
            exitSignal: true,
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
function attemptWhere(input: { userId: string; materialId: string; classId?: string }) {
  return {
    userId: input.userId,
    ...(input.classId ? {classId: input.classId} : {}),
    materialId: input.materialId,
    sourceMaterialId: input.materialId,
    // Counted attempts only: a queued, cancelled, or judge-faulted row is not
    // something the student did, so it never appears in a history a teacher
    // reads back to them. A platform re-grade is the same kind of thing — the
    // row carries the student's code, but the student did not write it today.
    status: { in: ["PASSED", "FAILED", "RECORDED"] satisfies SubmissionStatus[] },
    regradeRunId: null,
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
    -- A repair the platform wrote is not an attempt the student made. This
    -- predicate does not gate on grading revision, so without the exclusion a
    -- re-grade would add one to every affected student's attempt count.
    AND s.regrade_run_id IS NULL
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

/**
 * Completion sources remain separate from exercise points and standing: a
 * view for reading, the latest attempt for a quiz, short answer or written
 * response, and a finished video.
 */
function readingCompletions(input: { userIds: string[]; classId: string }) {
  return Prisma.sql`latest_quiz AS (
    SELECT DISTINCT ON (s.user_id, s.material_id) s.user_id, s.material_id, s.created_at, COALESCE(r.completed, CASE WHEN a.status = 'GRADED' THEN a.completed END, CASE WHEN q.status = 'GRADED' THEN q.completed END) AS completed
    FROM manual_submissions s LEFT JOIN multiple_choice_assessments a ON a.submission_id = s.id
    LEFT JOIN short_answer_assessments q ON q.submission_id = s.id
    LEFT JOIN LATERAL (SELECT completed, score_hundredths FROM manual_reviews r WHERE r.submission_id = s.id ORDER BY version DESC LIMIT 1) r ON true
    WHERE s.user_id = ANY(${input.userIds}::uuid[]) AND s.class_id = ${input.classId}::uuid
    ORDER BY s.user_id, s.material_id, s.created_at DESC, s.id DESC
  ), done AS (
    SELECT user_id, material_id, first_viewed_at AS at FROM student_material_views WHERE user_id = ANY(${input.userIds}::uuid[])
    UNION ALL SELECT p.user_id, p.material_id, p.updated_at FROM video_watch_progress p JOIN video_lessons v ON v.material_id = p.material_id AND v.asset_id = p.asset_id
      WHERE p.user_id = ANY(${input.userIds}::uuid[]) AND p.class_id = ${input.classId}::uuid AND p.completed
    UNION ALL SELECT user_id, material_id, created_at FROM latest_quiz WHERE completed
  )`;
}
