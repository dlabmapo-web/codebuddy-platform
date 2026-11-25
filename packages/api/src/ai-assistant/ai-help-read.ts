import type { CaseOutcome } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { usageMonth } from "./usage.js";

/** A reservation older than this belongs to a request that never finished. */
export const PENDING_SECONDS = 60;

/**
 * One test of the submission. A hidden test's data is here for the server's
 * own comparisons and leak check; only counts by kind may reach a prompt.
 */
type CaseRow = {
  position: number;
  is_sample: boolean;
  outcome: CaseOutcome;
  actual_output: string | null;
  /** A built-in type for a hidden test; see `casePythonError`. */
  error_type: string | null;
  /** Public tests only; null for every hidden one, in the statement itself. */
  error_message: string | null;
  error_line: number | null;
  input: string | null;
  expected_output: string | null;
  comparator: string | null;
  /** How a wrong output differs, worked out by the grader; the only trace a hidden output leaves. */
  output_difference: string | null;
};

export type StoredReply = { id: string; level: number; reply: string; analysis: unknown; createdAt: string; reported: boolean };

export type HelpContext = {
  submission: {
    status: string; code: string; language: string; classId: string | null; sourceMaterialId: string; materialId: string | null;
    gradingRevision: number; submissionPolicy: string; inExam: boolean; quiz: boolean; repair: boolean; aborted: boolean;
  };
  exercise: {
    description: string; inputFormat: string; outputFormat: string; constraints: string;
    aiFeedbackEnabled: boolean; gradingRevision: number; submissionPolicy: string; language: string; plain: boolean; lectureKind: string;
  } | null;
  cases: CaseRow[];
  featureOn: boolean;
  examOpen: boolean;
  monthCostMicros: number;
  usedForProblem: number;
  usedToday: number;
  /** This submission's answers: its analysis, and its simpler explanation. */
  replies: StoredReply[];
  /** For the leak check on this server only. Never part of a prompt. */
  solutions: string[];
  /** The teacher's path: hints the teacher wrote, else the library's checked hints. */
  hints: { ko: string; en: string }[];
  library: { id: string; label: string; textKo: string; textEn: string; publicOutputs: Record<string, string> | null; fingerprint: string | null }[];
};

/**
 * Everything one help request decides on, in one statement.
 *
 * The caller has already proven that this student owns the submission and may
 * still reach its problem. `full` adds what only a model call needs.
 */
export async function readHelpContext(
  db: Pick<PrismaService, "$queryRaw">,
  input: { academyId: string; userId: string; submissionId: string; dayStart: Date; full: boolean; now?: Date },
): Promise<HelpContext | null> {
  const [row] = await db.$queryRaw<{ context: HelpContext & { monthCostMicros: number | string } }[]>(Prisma.sql`
    SELECT jsonb_build_object(
      'submission', jsonb_build_object(
        'status', s.status, 'code', CASE WHEN ${input.full} THEN s.code ELSE '' END, 'language', s.language, 'classId', s.class_id,
        'sourceMaterialId', s.source_material_id, 'materialId', s.material_id, 'gradingRevision', s.grading_revision,
        'submissionPolicy', s.submission_policy, 'inExam', s.test_attempt_id IS NOT NULL, 'quiz', s.quiz_snapshot IS NOT NULL,
        'repair', s.regrade_run_id IS NOT NULL, 'aborted', s.grading_aborted),
      'exercise', CASE WHEN pe.material_id IS NULL THEN NULL ELSE jsonb_build_object(
        'description', CASE WHEN ${input.full} THEN pe.description ELSE '' END,
        'inputFormat', pe.input_format, 'outputFormat', pe.output_format, 'constraints', pe.constraints,
        'aiFeedbackEnabled', pe.ai_feedback_enabled, 'gradingRevision', pe.grading_revision, 'submissionPolicy', pe.submission_policy,
        'language', pe.language, 'plain', pe.quiz IS NULL AND pe.source_project IS NULL, 'lectureKind', l.kind) END,
      'cases', CASE WHEN NOT ${input.full} THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('position', k.position, 'is_sample', k.is_sample, 'outcome', k.outcome,
          'actual_output', k.actual_output, 'error_type', k.python_error_type,
          'error_message', CASE WHEN k.is_sample THEN k.python_error_message END, 'error_line', k.python_error_line,
          'output_difference', k.output_difference,
          'input', g.input, 'expected_output', g.expected_output, 'comparator', g.comparator) ORDER BY k.position)
        FROM submission_cases k
        LEFT JOIN submission_grading_cases g ON g.submission_id = k.submission_id AND g.position = k.position
        WHERE k.submission_id = s.id), '[]'::jsonb) END,
      'featureOn', EXISTS (SELECT 1 FROM academy_feature_flags f WHERE f.academy_id = c.academy_id AND f.feature = 'AI_ASSISTANT' AND f.is_enabled),
      'examOpen', EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = s.user_id AND ta.ended_at IS NULL
        AND (ta.deadline_at IS NULL OR ta.deadline_at > now())),
      'monthCostMicros', COALESCE((SELECT u.cost_micros FROM ai_usage_months u WHERE u.month = ${usageMonth(input.now)}::date AND u.kind = 'HELP'), 0),
      'usedForProblem', used.problem, 'usedToday', used.today,
      'replies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'level', r.level, 'reply', r.reply, 'analysis', r.analysis,
          'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'reported', r.reported_at IS NOT NULL) ORDER BY r.level, r.created_at)
        FROM ai_help_replies r WHERE r.submission_id = s.id AND r.user_id = s.user_id AND r.status = 'DONE'), '[]'::jsonb),
      'solutions', CASE WHEN NOT ${input.full} THEN '[]'::jsonb ELSE
        COALESCE((SELECT jsonb_agg(sol.code) FROM programming_exercise_solutions sol WHERE sol.material_id = pe.material_id), '[]'::jsonb)
        || CASE WHEN pe.solution_code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(pe.solution_code) END
        || COALESCE((SELECT jsonb_agg(p ->> 'code') FROM jsonb_array_elements(lib.correct_programs) p), '[]'::jsonb) END,
      'hints', CASE WHEN NOT ${input.full} THEN '[]'::jsonb ELSE COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('ko', h.content, 'en', h.content) ORDER BY h.position, h.id) FROM exercise_hints h WHERE h.exercise_material_id = pe.material_id),
        CASE WHEN lib.grading_revision IS DISTINCT FROM pe.grading_revision THEN NULL ELSE
          (SELECT jsonb_agg(jsonb_build_object('ko', x.text_ko, 'en', x.text_en) ORDER BY x.position, x.id)
           FROM ai_library_items x WHERE x.material_id = lib.material_id AND x.kind = 'HINT' AND x.state = 'ACTIVE') END,
        '[]'::jsonb) END,
      'library', CASE WHEN NOT ${input.full} OR lib.grading_revision IS DISTINCT FROM pe.grading_revision THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'textKo', i.text_ko, 'textEn', i.text_en, 'publicOutputs', i.public_outputs, 'fingerprint', i.fingerprint) ORDER BY i.position, i.id)
        FROM (SELECT * FROM ai_library_items x WHERE x.material_id = lib.material_id AND x.kind = 'FEEDBACK' AND x.state = 'ACTIVE' ORDER BY x.position, x.id LIMIT 10) i), '[]'::jsonb) END
    ) AS context
    FROM submissions s JOIN courses c ON c.id = s.course_id
    LEFT JOIN materials m ON m.id = s.material_id LEFT JOIN lectures l ON l.id = m.lecture_id
    LEFT JOIN programming_exercises pe ON pe.material_id = m.id
    LEFT JOIN ai_libraries lib ON lib.material_id = pe.material_id
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.material_id = s.source_material_id) AS problem, count(*) AS today FROM ai_help_replies r
      WHERE r.user_id = s.user_id AND r.created_at >= ${input.dayStart}
        AND (r.status = 'DONE' OR (r.status = 'PENDING' AND r.created_at > now() - make_interval(secs => ${PENDING_SECONDS}::int)))) used
    WHERE s.id = ${input.submissionId}::uuid AND s.user_id = ${input.userId}::uuid AND c.academy_id = ${input.academyId}::uuid`);
  if (!row) return null;
  return { ...row.context, monthCostMicros: Number(row.context.monthCostMicros) };
}

export type Reservation = { id: string; level: number };

/**
 * Takes one of the student's answers for today, or none: none past a limit,
 * and none when this submission already has an answer of this level or one
 * is being written. The caller holds the student's lock.
 */
export async function reserveReply(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: {
    requestId: string; userId: string; academyId: string; classId: string | null; submissionId: string; materialId: string;
    gradingRevision: number; level: number; locale: string; promptVersion: string; dayStart: Date; problemLimit: number; dailyLimit: number;
  },
): Promise<Reservation | null> {
  const [row] = await tx.$queryRaw<Reservation[]>(Prisma.sql`
    INSERT INTO ai_help_replies (id, request_id, user_id, academy_id, class_id, submission_id, material_id, grading_revision, level, locale, status, prompt_version)
    SELECT gen_random_uuid(), ${input.requestId}::uuid, ${input.userId}::uuid, ${input.academyId}::uuid, ${input.classId}::uuid, ${input.submissionId}::uuid,
      ${input.materialId}::uuid, ${input.gradingRevision}, ${input.level}, ${input.locale}, 'PENDING', ${input.promptVersion}
    FROM (
      SELECT count(*) FILTER (WHERE r.material_id = ${input.materialId}::uuid) AS problem, count(*) AS today FROM ai_help_replies r
      WHERE r.user_id = ${input.userId}::uuid AND r.created_at >= ${input.dayStart}
        AND (r.status = 'DONE' OR (r.status = 'PENDING' AND r.created_at > now() - make_interval(secs => ${PENDING_SECONDS}::int)))) used
    WHERE used.problem < ${input.problemLimit} AND used.today < ${input.dailyLimit}
      AND NOT EXISTS (SELECT 1 FROM ai_help_replies x WHERE x.submission_id = ${input.submissionId}::uuid AND x.level = ${input.level}
        AND (x.status = 'DONE' OR (x.status = 'PENDING' AND x.created_at > now() - make_interval(secs => ${PENDING_SECONDS}::int))))
    RETURNING id, level::int`);
  return row ?? null;
}

export type ReplyOutcome = {
  id: string;
  status: "DONE" | "FAILED";
  reply: string | null;
  analysis: unknown;
  failureCode: string | null;
  libraryItemId: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number;
};

/** Ends a reservation and adds what it cost to the month, in one statement. */
export async function finishReply(db: Pick<PrismaService, "$executeRaw">, outcome: ReplyOutcome, now = new Date()): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    WITH done AS (
      UPDATE ai_help_replies SET status = ${outcome.status}::"AiHelpStatus", reply = ${outcome.reply},
        analysis = ${outcome.analysis === null || outcome.analysis === undefined ? null : JSON.stringify(outcome.analysis)}::jsonb, failure_code = ${outcome.failureCode},
        library_item_id = (SELECT i.id FROM ai_library_items i WHERE i.id = ${outcome.libraryItemId}::uuid),
        model = ${outcome.model?.slice(0, 80) ?? null}, input_tokens = ${outcome.inputTokens}, output_tokens = ${outcome.outputTokens},
        cost_micros = ${outcome.costMicros}, latency_ms = ${outcome.latencyMs}, completed_at = now()
      WHERE id = ${outcome.id}::uuid AND status = 'PENDING' RETURNING 1)
    INSERT INTO ai_usage_months AS u (month, kind, requests, input_tokens, output_tokens, cost_micros)
    VALUES (${usageMonth(now)}::date, 'HELP', 1, ${outcome.inputTokens}, ${outcome.outputTokens}, ${outcome.costMicros})
    ON CONFLICT (month, kind) DO UPDATE SET requests = u.requests + 1, input_tokens = u.input_tokens + EXCLUDED.input_tokens,
      output_tokens = u.output_tokens + EXCLUDED.output_tokens, cost_micros = u.cost_micros + EXCLUDED.cost_micros`);
}
