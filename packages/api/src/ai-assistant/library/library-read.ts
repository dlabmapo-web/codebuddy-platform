import { Prisma } from "../../generated/prisma/client.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { ExerciseGradingSource } from "../../judge/grading-profile.js";

type Db = Pick<PrismaService, "$queryRaw" | "$executeRaw">;

/**
 * An exercise that may have a library: AI on for the academy and the exercise,
 * automatic, plain single-file Python, in an ordinary visible lecture, with a
 * public case. `pe`, `m`, `l`, `cm`, `c` and `a` are the caller's aliases.
 */
const eligible = Prisma.sql`
  pe.ai_feedback_enabled AND pe.submission_policy = 'AUTOMATIC' AND pe.quiz IS NULL
  AND pe.language = 'PYTHON' AND pe.source_project IS NULL
  AND m.type = 'PROGRAMMING_EXERCISE' AND l.kind = 'STANDARD'
  AND m.is_visible AND l.is_visible AND cm.is_visible AND c.is_visible
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
 * Queues every eligible exercise whose library is missing or whose content
 * changed, in one statement.
 *
 * Courses are edited through several writers — the editor, imports, library
 * sync, course copies. Comparing what is stored covers all of them, where a
 * hook in each would miss the next one. An exercise edited in the last
 * `quietMinutes` waits, so a teacher still typing pays for one library.
 */
export async function queueChangedLibraries(db: Db, quietMinutes: number, limit = 100): Promise<number> {
  return db.$executeRaw(Prisma.sql`
    INSERT INTO ai_libraries AS lib (material_id, content_digest, grading_revision, state, compared_at, updated_at)
    SELECT pe.material_id, ${digest}, pe.grading_revision, 'WAITING', pe.updated_at, now()
    ${place}
    LEFT JOIN ai_libraries old ON old.material_id = pe.material_id
    WHERE ${eligible}
      AND pe.updated_at <= now() - make_interval(mins => ${quietMinutes}::int)
      AND (old.material_id IS NULL OR old.compared_at < pe.updated_at)
    ORDER BY pe.updated_at, pe.material_id LIMIT ${limit}
    ON CONFLICT (material_id) DO UPDATE SET
      compared_at = EXCLUDED.compared_at, updated_at = now(),
      -- The same content at a new revision keeps its library; other content is
      -- written again, and the items stay marked with the revision they fit.
      grading_revision = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN EXCLUDED.grading_revision ELSE lib.grading_revision END,
      state = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.state ELSE 'WAITING'::"AiLibraryState" END,
      attempts = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.attempts ELSE 0 END,
      next_attempt_at = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.next_attempt_at ELSE now() END,
      lease_id = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.lease_id ELSE NULL END,
      lease_until = CASE WHEN lib.content_digest = EXCLUDED.content_digest THEN lib.lease_until ELSE NULL END,
      content_digest = EXCLUDED.content_digest`);
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

/** Libraries whose students keep making a mistake it lacks (§10.9). */
export async function claimGrowth(db: Db, leaseId: string): Promise<ClaimedLibrary | null> {
  const [row] = await db.$queryRaw<{ material_id: string; attempts: number; content_digest: string }[]>(Prisma.sql`
    UPDATE ai_libraries SET lease_id = ${leaseId}::uuid, lease_until = now() + interval '5 minutes', grown_at = now(), updated_at = now()
    WHERE material_id = (
      SELECT lib.material_id FROM ai_libraries lib JOIN programming_exercises pe ON pe.material_id = lib.material_id
      WHERE lib.state = 'READY' AND (lib.lease_until IS NULL OR lib.lease_until < now())
        AND lib.grading_revision = pe.grading_revision AND pe.ai_feedback_enabled
        AND (lib.grown_at IS NULL OR lib.grown_at < now() - interval '7 days')
        AND (SELECT count(*) FROM ai_library_items i WHERE i.material_id = lib.material_id AND i.kind = 'FEEDBACK' AND i.state = 'ACTIVE') < 10
        AND (SELECT count(*) >= 5 AND count(DISTINCT r.user_id) >= 3 FROM ai_help_replies r
             WHERE r.material_id = lib.material_id AND r.grading_revision = lib.grading_revision AND r.status = 'DONE'
               AND r.library_item_id IS NULL AND r.created_at > now() - interval '30 days')
      ORDER BY lib.grown_at NULLS FIRST, lib.material_id FOR UPDATE OF lib SKIP LOCKED LIMIT 1)
    RETURNING material_id, attempts, content_digest`);
  return row ? { materialId: row.material_id, leaseId, attempts: row.attempts, digest: row.content_digest } : null;
}
