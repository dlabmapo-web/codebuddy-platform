import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { ExerciseGradingSource } from "../../judge/grading-profile.js";

type Db = Pick<PrismaService, "$queryRaw" | "$executeRaw">;

/**
 * Mistakes one problem keeps. Every new mistake is learned (the campus courses
 * design, §7); an analysis still sends the model only the closest few.
 */
export const FEEDBACK_MAX = 30;

/**
 * An exercise that may have a library: AI on for the academy, the course and
 * the exercise, automatic, plain single-file Python, in an ordinary lecture,
 * with a public case. Visibility does not count: a problem is learned as soon
 * as it is saved, so its notes are ready before students see it (the campus
 * courses design, §5). `pe`, `m`, `l`, `cm`, `c` and `a` are the caller's aliases.
 */
const eligible = Prisma.sql`
  pe.ai_feedback_enabled AND c.ai_teacher_enabled AND pe.submission_policy = 'AUTOMATIC' AND pe.quiz IS NULL
  AND pe.language = 'PYTHON' AND pe.source_project IS NULL
  AND m.type = 'PROGRAMMING_EXERCISE' AND l.kind = 'STANDARD'
  AND a.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM academy_feature_flags f WHERE f.academy_id = c.academy_id AND f.feature = 'AI_ASSISTANT' AND f.is_enabled)
  AND EXISTS (SELECT 1 FROM exercise_test_cases s WHERE s.exercise_material_id = pe.material_id AND s.visibility = 'SAMPLE')`;

const place = Prisma.sql`
  FROM programming_exercises pe JOIN materials m ON m.id = pe.material_id
  JOIN lectures l ON l.id = m.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id
  JOIN courses c ON c.id = cm.course_id JOIN academies a ON a.id = c.academy_id`;

/** Everything a library is written from. Equal digests may share a library. */
const digest = Prisma.sql`md5(jsonb_build_array(
  pe.description, pe.input_format, pe.output_format, pe.constraints, pe.language, pe.solution_code,
  (SELECT jsonb_agg(jsonb_build_array(tc.position, tc.input, tc.expected_output, tc.visibility, tc.comparator) ORDER BY tc.position, tc.id)
     FROM exercise_test_cases tc WHERE tc.exercise_material_id = pe.material_id),
  (SELECT jsonb_agg(sol.code ORDER BY sol.position) FROM programming_exercise_solutions sol WHERE sol.material_id = pe.material_id)
)::text)`;

/**
 * The same content at a new revision keeps its library; other content is
 * written again, and the items stay marked with the revision they fit. A
 * library put off because its problem was not eligible starts at once when it
 * is queued again.
 */
const requeue = Prisma.sql`
  ON CONFLICT (material_id) DO UPDATE SET
    compared_at = EXCLUDED.compared_at, updated_at = now(),
    grading_revision = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN EXCLUDED.grading_revision ELSE lib.grading_revision END,
    state = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.state ELSE 'WAITING'::"AiLibraryState" END,
    attempts = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.attempts ELSE 0 END,
    next_attempt_at = CASE WHEN lib.content_digest <> EXCLUDED.content_digest THEN now()
      WHEN lib.state = 'WAITING' AND lib.last_error_code = 'OFF' THEN LEAST(lib.next_attempt_at, now())
      ELSE lib.next_attempt_at END,
    lease_id = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.lease_id ELSE NULL END,
    lease_until = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.lease_until ELSE NULL END,
    content_digest = EXCLUDED.content_digest`;

/**
 * Queues every eligible exercise whose library is missing or whose content
 * changed, in one statement.
 *
 * Courses are edited through several writers — the editor, imports, library
 * sync, course copies. Comparing what is stored covers all of them, where a
 * hook in each would miss the next one. The editor also queues its own saves
 * at once (`queueLibraries`); this sweep is the safety net. An exercise edited
 * in the last `quietMinutes` waits (0 by default since November 26, 2026).
 */
export async function queueChangedLibraries(db: Db, quietMinutes: number, limit = 100): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    INSERT INTO ai_libraries AS lib (material_id, content_digest, grading_revision, state, compared_at, updated_at)
    SELECT pe.material_id, ${digest}, pe.grading_revision, 'WAITING', pe.updated_at, now()
    ${place}
    LEFT JOIN ai_libraries old ON old.material_id = pe.material_id
    WHERE ${eligible}
      -- With no quiet time there is nothing to wait for. Comparing anyway would
      -- put off a problem whose time the API's clock wrote a moment ahead of the database's.
      AND (${quietMinutes}::int = 0 OR pe.updated_at <= now() - make_interval(mins => ${quietMinutes}::int))
      AND (old.material_id IS NULL OR old.compared_at < pe.updated_at)
    ORDER BY pe.updated_at, pe.material_id LIMIT ${limit}
    ${requeue}`);
}

/**
 * Queues the named exercises, or every exercise of one course, when eligible
 * and new or changed: one statement, inside the transaction that saved them,
 * so learning starts right after Create or Save (the campus courses design,
 * §5). Wake the job after the commit with `wakeLibraryJob`.
 */
export async function queueLibraries(db: Pick<Prisma.TransactionClient, "$executeRaw">, scope: { materialIds: string[] } | { courseId: string }): Promise<number> {
  const where = "courseId" in scope
    ? Prisma.sql`c.id = ${scope.courseId}::uuid`
    : Prisma.sql`pe.material_id = ANY(${scope.materialIds}::uuid[])`;
  if ("materialIds" in scope && !scope.materialIds.length) return 0;
  return db.$executeRaw(Prisma.sql`
    INSERT INTO ai_libraries AS lib (material_id, content_digest, grading_revision, state, compared_at, updated_at)
    SELECT pe.material_id, ${digest}, pe.grading_revision, 'WAITING', pe.updated_at, now()
    ${place}
    WHERE ${where} AND ${eligible}
    ${requeue}`);
}

export type LibraryExercise = ExerciseGradingSource & {
  materialId: string;
  courseId: string;
  academyId: string;
  gradingRevision: number;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  /** Teacher solutions, in order. */
  solutions: string[];
  eligible: boolean;
  digest: string;
};

/** One exercise with everything a library needs, in one statement. */
export async function readLibraryExercise(db: Db, materialId: string): Promise<LibraryExercise | null> {
  const [row] = await db.$queryRaw<{ exercise: Record<string, unknown>; tests: Record<string, unknown>[]; solutions: string[] | null; solution_code: string | null; course_id: string; academy_id: string; eligible: boolean; digest: string }[]>(Prisma.sql`
    SELECT to_jsonb(pe) - 'solution_code' - 'quiz' - 'starter_code' AS exercise, pe.solution_code,
      (SELECT jsonb_agg(to_jsonb(tc) ORDER BY tc.position, tc.id) FROM exercise_test_cases tc WHERE tc.exercise_material_id = pe.material_id) AS tests,
      (SELECT jsonb_agg(sol.code ORDER BY sol.position) FROM programming_exercise_solutions sol WHERE sol.material_id = pe.material_id) AS solutions,
      c.id AS course_id, c.academy_id, (${eligible}) AS eligible, ${digest} AS digest
    ${place}
    WHERE pe.material_id = ${materialId}::uuid`);
  if (!row) return null;
  const solutions = (row.solutions ?? []).filter((code) => code.trim() !== "");
  return {
    ...(columns(row.exercise) as unknown as LibraryExercise),
    testCases: (row.tests ?? []).map((item) => columns(item)) as unknown as LibraryExercise["testCases"],
    courseId: row.course_id,
    academyId: row.academy_id,
    solutions: solutions.length ? solutions : row.solution_code?.trim() ? [row.solution_code] : [],
    eligible: row.eligible,
    digest: row.digest,
  };
}

function columns(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), item]));
}

export type ClaimedLibrary = { materialId: string; leaseId: string; attempts: number; digest: string };

/** Takes one due library. A lost lease is taken again, and its holder cannot commit. */
export async function claimLibrary(db: Db, from: "WAITING" | "REVIEWING", leaseId: string): Promise<ClaimedLibrary | null> {
  const working = from === "WAITING" ? Prisma.sql`'WRITING'` : Prisma.sql`'REVIEWING'`;
  const [row] = await db.$queryRaw<{ material_id: string; attempts: number; content_digest: string }[]>(Prisma.sql`
    UPDATE ai_libraries SET state = ${working}::"AiLibraryState", lease_id = ${leaseId}::uuid,
      lease_until = now() + interval '5 minutes', updated_at = now(),
      attempts = attempts + ${from === "WAITING" ? 1 : 0}::int
    WHERE material_id = (
      SELECT material_id FROM ai_libraries
      WHERE next_attempt_at <= now() AND (
        (state = ${from}::"AiLibraryState" AND (lease_until IS NULL OR lease_until < now()))
        OR (state = ${working}::"AiLibraryState" AND lease_until < now()))
      ORDER BY next_attempt_at, material_id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING material_id, attempts, content_digest`);
  return row ? { materialId: row.material_id, leaseId, attempts: row.attempts, digest: row.content_digest } : null;
}

/** Libraries whose every check has ended, to be judged. */
export async function checkedLibraries(db: Db, limit = 10): Promise<string[]> {
  const rows = await db.$queryRaw<{ material_id: string }[]>(Prisma.sql`
    SELECT lib.material_id FROM ai_libraries lib WHERE lib.state = 'CHECKING'
      AND NOT EXISTS (SELECT 1 FROM ai_library_checks k WHERE k.material_id = lib.material_id AND k.status IN ('QUEUED', 'RUNNING'))
    ORDER BY lib.updated_at LIMIT ${limit}`);
  return rows.map((row) => row.material_id);
}

export type ClaimedGrowth = ClaimedLibrary & { since: Date | null };

/**
 * A library with at least one AI answer that matched none of its mistakes
 * since its last growth (the campus courses design, §7): every new mistake is
 * checked, not only one that several students share, and not once a week.
 * Returns when it last grew, so the caller reads only the answers since.
 */
export async function claimGrowth(db: Db, leaseId: string, feedbackMax: number): Promise<ClaimedGrowth | null> {
  const [row] = await db.$queryRaw<{ material_id: string; attempts: number; content_digest: string; since: Date | null }[]>(Prisma.sql`
    WITH pick AS (
      SELECT lib.material_id, lib.grown_at AS since FROM ai_libraries lib JOIN programming_exercises pe ON pe.material_id = lib.material_id
      WHERE lib.state = 'READY' AND (lib.lease_until IS NULL OR lib.lease_until < now())
        AND lib.grading_revision = pe.grading_revision AND pe.ai_feedback_enabled
        AND (SELECT count(*) FROM ai_library_items i WHERE i.material_id = lib.material_id AND i.kind = 'FEEDBACK' AND i.state = 'ACTIVE') < ${feedbackMax}
        AND EXISTS (SELECT 1 FROM ai_help_replies r
             WHERE r.material_id = lib.material_id AND r.grading_revision = lib.grading_revision AND r.status = 'DONE'
               AND r.library_item_id IS NULL AND r.created_at > now() - interval '30 days'
               AND r.completed_at > COALESCE(lib.grown_at, '-infinity'::timestamptz))
      ORDER BY lib.grown_at NULLS FIRST, lib.material_id FOR UPDATE OF lib SKIP LOCKED LIMIT 1)
    UPDATE ai_libraries u SET lease_id = ${leaseId}::uuid, lease_until = now() + interval '5 minutes', grown_at = now(), updated_at = now()
    FROM pick WHERE u.material_id = pick.material_id
    RETURNING u.material_id, u.attempts, u.content_digest, pick.since`);
  return row ? { materialId: row.material_id, leaseId, attempts: row.attempts, digest: row.content_digest, since: row.since } : null;
}
