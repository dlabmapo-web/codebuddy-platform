import { AI_HELP_HISTORY_MAX, aiAnalysisSchema, aiHelpSourceSchema, type AiHelpHistoryItem, type CaseOutcome } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { FEEDBACK_MAX } from "./library/library-read.js";
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
    /** The course's AI teacher choice (the campus courses design, §4). */
    courseOn: boolean;
  } | null;
  /** Only the examples ran: an answer after Run or Test run (the campus courses design, §6). */
  examplesOnly?: boolean;
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

/** The exercise as a help request decides on it. `pe`, `l` and `c` are the caller's aliases. */
function exerciseJson(full: boolean): Prisma.Sql {
  return Prisma.sql`CASE WHEN pe.material_id IS NULL THEN NULL ELSE jsonb_build_object(
        'description', CASE WHEN ${full} THEN pe.description ELSE '' END,
        'inputFormat', pe.input_format, 'outputFormat', pe.output_format, 'constraints', pe.constraints,
        'aiFeedbackEnabled', pe.ai_feedback_enabled, 'gradingRevision', pe.grading_revision, 'submissionPolicy', pe.submission_policy,
        'language', pe.language, 'plain', pe.quiz IS NULL AND pe.source_project IS NULL, 'lectureKind', l.kind,
        'courseOn', c.ai_teacher_enabled) END`;
}

/** The switches, the month's cost and the student's answers today. `c` and `used` are the caller's. */
function limitsJson(userId: Prisma.Sql, now: Date | undefined): Prisma.Sql {
  return Prisma.sql`'featureOn', EXISTS (SELECT 1 FROM academy_feature_flags f WHERE f.academy_id = c.academy_id AND f.feature = 'AI_ASSISTANT' AND f.is_enabled),
      'examOpen', EXISTS (SELECT 1 FROM test_attempts ta WHERE ta.user_id = ${userId} AND ta.ended_at IS NULL
        AND (ta.deadline_at IS NULL OR ta.deadline_at > now())),
      'monthCostMicros', COALESCE((SELECT u.cost_micros FROM ai_usage_months u WHERE u.month = ${usageMonth(now)}::date AND u.kind = 'HELP'), 0),
      'usedForProblem', used.problem, 'usedToday', used.today`;
}

/** Answers counted against the limits: one line for Run, Test run and Submit alike. */
function usedLateral(userId: Prisma.Sql, materialId: Prisma.Sql, dayStart: Date): Prisma.Sql {
  return Prisma.sql`CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.material_id = ${materialId}) AS problem, count(*) AS today FROM ai_help_replies r
      WHERE r.user_id = ${userId} AND r.created_at >= ${dayStart}
        AND (r.status = 'DONE' OR (r.status = 'PENDING' AND r.created_at > now() - make_interval(secs => ${PENDING_SECONDS}::int)))) used`;
}

/** The leak check's solutions, the teacher's path and the known mistakes. `pe` and `lib` are the caller's. */
function knowledgeJson(full: boolean): Prisma.Sql {
  return Prisma.sql`'solutions', CASE WHEN NOT ${full} THEN '[]'::jsonb ELSE
        COALESCE((SELECT jsonb_agg(sol.code) FROM programming_exercise_solutions sol WHERE sol.material_id = pe.material_id), '[]'::jsonb)
        || CASE WHEN pe.solution_code IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(pe.solution_code) END
        || COALESCE((SELECT jsonb_agg(p ->> 'code') FROM jsonb_array_elements(lib.correct_programs) p), '[]'::jsonb) END,
      'hints', CASE WHEN NOT ${full} THEN '[]'::jsonb ELSE COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('ko', h.content, 'en', h.content) ORDER BY h.position, h.id) FROM exercise_hints h WHERE h.exercise_material_id = pe.material_id),
        CASE WHEN lib.grading_revision IS DISTINCT FROM pe.grading_revision THEN NULL ELSE
          (SELECT jsonb_agg(jsonb_build_object('ko', x.text_ko, 'en', x.text_en) ORDER BY x.position, x.id)
           FROM ai_library_items x WHERE x.material_id = lib.material_id AND x.kind = 'HINT' AND x.state = 'ACTIVE') END,
        '[]'::jsonb) END,
      'library', CASE WHEN NOT ${full} OR lib.grading_revision IS DISTINCT FROM pe.grading_revision THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', i.id, 'label', i.label, 'textKo', i.text_ko, 'textEn', i.text_en, 'publicOutputs', i.public_outputs, 'fingerprint', i.fingerprint) ORDER BY i.position, i.id)
        FROM (SELECT * FROM ai_library_items x WHERE x.material_id = lib.material_id AND x.kind = 'FEEDBACK' AND x.state = 'ACTIVE' ORDER BY x.position, x.id LIMIT ${FEEDBACK_MAX}) i), '[]'::jsonb) END`;
}

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
      'exercise', ${exerciseJson(input.full)},
      'cases', CASE WHEN NOT ${input.full} THEN '[]'::jsonb ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object('position', k.position, 'is_sample', k.is_sample, 'outcome', k.outcome,
          'actual_output', k.actual_output, 'error_type', k.python_error_type,
          'error_message', CASE WHEN k.is_sample THEN k.python_error_message END, 'error_line', k.python_error_line,
          'output_difference', k.output_difference,
          'input', g.input, 'expected_output', g.expected_output, 'comparator', g.comparator) ORDER BY k.position)
        FROM submission_cases k
        LEFT JOIN submission_grading_cases g ON g.submission_id = k.submission_id AND g.position = k.position
        WHERE k.submission_id = s.id), '[]'::jsonb) END,
      ${limitsJson(Prisma.sql`s.user_id`, input.now)},
      'replies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'level', r.level, 'reply', r.reply, 'analysis', r.analysis,
          'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'reported', r.reported_at IS NOT NULL) ORDER BY r.level, r.created_at)
        FROM ai_help_replies r WHERE r.submission_id = s.id AND r.user_id = s.user_id AND r.status = 'DONE'), '[]'::jsonb),
      ${knowledgeJson(input.full)}
    ) AS context
    FROM submissions s JOIN courses c ON c.id = s.course_id
    LEFT JOIN materials m ON m.id = s.material_id LEFT JOIN lectures l ON l.id = m.lecture_id
    LEFT JOIN programming_exercises pe ON pe.material_id = m.id
    LEFT JOIN ai_libraries lib ON lib.material_id = pe.material_id
    ${usedLateral(Prisma.sql`s.user_id`, Prisma.sql`s.source_material_id`, input.dayStart)}
    WHERE s.id = ${input.submissionId}::uuid AND s.user_id = ${input.userId}::uuid AND c.academy_id = ${input.academyId}::uuid`);
  if (!row) return null;
  return { ...row.context, monthCostMicros: Number(row.context.monthCostMicros) };
}

/** A student's example check, as AI help after Run or Test run reads it. */
export type CheckRow = {
  id: string;
  status: "QUEUED" | "RUNNING" | "PASSED" | "FAILED" | "ERRORED";
  source: "TEST_RUN" | "RUN";
  classId: string | null;
  gradingRevision: number;
};

type CheckJson = CheckRow & {
  code: string;
  results: { position: number; outcome: CaseOutcome; actualOutput: string | null; outputDifference: string | null;
    errorType: string | null; errorMessage: string | null; errorLine: number | null }[] | null;
  cases: { position: number; input: string; expectedOutput: string; comparator: string }[] | null;
};

/**
 * Everything AI help on the code in a student's editor decides on, in one
 * statement (the campus courses design, §6): the exercise, the switches and
 * limits, and the student's check of this very code at the current revision,
 * or the check named, with its answers. A check stuck for a minute is gone.
 *
 * The caller has already proven that this student may reach the problem.
 */
export async function readCheckHelpContext(
  db: Pick<PrismaService, "$queryRaw">,
  input: { academyId: string; userId: string; materialId: string; codeHash: string; checkId: string | null; dayStart: Date; full: boolean; now?: Date },
): Promise<{ context: HelpContext; check: CheckRow | null; courseId: string } | null> {
  const userId = Prisma.sql`${input.userId}::uuid`;
  const [row] = await db.$queryRaw<{ course_id: string; context: Omit<HelpContext, "submission" | "cases"> & { monthCostMicros: number | string; check: CheckJson | null } }[]>(Prisma.sql`
    SELECT c.id AS course_id, jsonb_build_object(
      'check', CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object('id', k.id, 'status', k.status, 'source', k.source,
        'classId', k.class_id, 'gradingRevision', k.grading_revision, 'code', CASE WHEN ${input.full} THEN k.code ELSE '' END,
        'results', CASE WHEN ${input.full} THEN k.results END, 'cases', CASE WHEN ${input.full} THEN k.snapshot -> 'gradingCases' END) END,
      'exercise', ${exerciseJson(input.full)},
      ${limitsJson(userId, input.now)},
      'replies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'level', r.level, 'reply', r.reply, 'analysis', r.analysis,
          'createdAt', to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'reported', r.reported_at IS NOT NULL) ORDER BY r.level, r.created_at)
        FROM ai_help_replies r WHERE r.check_id = k.id AND r.user_id = ${userId} AND r.status = 'DONE'), '[]'::jsonb),
      ${knowledgeJson(input.full)}
    ) AS context
    FROM programming_exercises pe JOIN materials m ON m.id = pe.material_id JOIN lectures l ON l.id = m.lecture_id
    JOIN course_modules cm ON cm.id = l.course_module_id JOIN courses c ON c.id = cm.course_id
    LEFT JOIN ai_libraries lib ON lib.material_id = pe.material_id
    LEFT JOIN LATERAL (
      SELECT x.* FROM ai_help_checks x WHERE x.user_id = ${userId} AND x.material_id = pe.material_id
        AND CASE WHEN ${input.checkId}::uuid IS NULL
          THEN x.code_hash = ${input.codeHash} AND x.grading_revision = pe.grading_revision AND x.status <> 'ERRORED'
            AND NOT (x.status IN ('QUEUED', 'RUNNING') AND x.created_at < now() - interval '1 minute')
          ELSE x.id = ${input.checkId}::uuid END
      ORDER BY x.created_at DESC LIMIT 1) k ON true
    ${usedLateral(userId, Prisma.sql`pe.material_id`, input.dayStart)}
    WHERE pe.material_id = ${input.materialId}::uuid AND c.academy_id = ${input.academyId}::uuid`);
  if (!row) return null;
  const { check, ...rest } = row.context;
  const exercise = rest.exercise;
  const results = new Map((check?.results ?? []).map((item) => [item.position, item]));
  const cases: CaseRow[] = (check?.cases ?? []).map((testCase) => {
    const result = results.get(testCase.position);
    return {
      position: testCase.position, is_sample: true, outcome: result?.outcome ?? "SKIPPED",
      actual_output: result?.actualOutput ?? null, output_difference: result?.outputDifference ?? null,
      error_type: result?.errorType ?? null, error_message: result?.errorMessage ?? null, error_line: result?.errorLine ?? null,
      input: testCase.input, expected_output: testCase.expectedOutput, comparator: testCase.comparator,
    };
  });
  const context: HelpContext = {
    ...rest,
    monthCostMicros: Number(rest.monthCostMicros),
    examplesOnly: true,
    submission: {
      status: check?.status ?? "NONE", code: check?.code ?? "", language: exercise?.language ?? "PYTHON", classId: check?.classId ?? null,
      sourceMaterialId: input.materialId, materialId: input.materialId, gradingRevision: check?.gradingRevision ?? exercise?.gradingRevision ?? 0,
      submissionPolicy: exercise?.submissionPolicy ?? "AUTOMATIC", inExam: false, quiz: false, repair: false, aborted: false,
    },
    cases,
  };
  return {
    context, courseId: row.course_id,
    check: check ? { id: check.id, status: check.status, source: check.source, classId: check.classId, gradingRevision: check.gradingRevision } : null,
  };
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
    requestId: string; userId: string; academyId: string; classId: string | null; materialId: string;
    /** A failed submission's answer, or an example check's: exactly one. */
    submissionId: string | null; checkId: string | null; source: "SUBMIT" | "TEST_RUN" | "RUN";
    gradingRevision: number; level: number; locale: string; promptVersion: string; dayStart: Date; problemLimit: number;
    /** Null: no limit across problems. */
    dailyLimit: number | null;
  },
): Promise<Reservation | null> {
  const sameSubject = input.checkId === null
    ? Prisma.sql`x.submission_id = ${input.submissionId}::uuid`
    : Prisma.sql`x.check_id = ${input.checkId}::uuid`;
  const [row] = await tx.$queryRaw<Reservation[]>(Prisma.sql`
    INSERT INTO ai_help_replies (id, request_id, user_id, academy_id, class_id, submission_id, check_id, source, material_id, grading_revision, level, locale, status, prompt_version)
    SELECT gen_random_uuid(), ${input.requestId}::uuid, ${input.userId}::uuid, ${input.academyId}::uuid, ${input.classId}::uuid, ${input.submissionId}::uuid,
      ${input.checkId}::uuid, ${input.source}::"AiHelpSource",
      ${input.materialId}::uuid, ${input.gradingRevision}, ${input.level}, ${input.locale}, 'PENDING', ${input.promptVersion}
    FROM (
      SELECT count(*) FILTER (WHERE r.material_id = ${input.materialId}::uuid) AS problem, count(*) AS today FROM ai_help_replies r
      WHERE r.user_id = ${input.userId}::uuid AND r.created_at >= ${input.dayStart}
        AND (r.status = 'DONE' OR (r.status = 'PENDING' AND r.created_at > now() - make_interval(secs => ${PENDING_SECONDS}::int)))) used
    WHERE used.problem < ${input.problemLimit} AND (${input.dailyLimit}::int IS NULL OR used.today < ${input.dailyLimit}::int)
      AND NOT EXISTS (SELECT 1 FROM ai_help_replies x WHERE ${sameSubject} AND x.level = ${input.level}
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

type HistoryRow = {
  id: string; level: number; reply: string; analysis: unknown; source: string; subject_id: string;
  created_at: string; reported: boolean; quoted: string | null;
};

/**
 * One student's saved answers on one problem, oldest first, in one statement
 * (the `user_id, material_id, created_at` index). The newest
 * `AI_HELP_HISTORY_MAX` only, and of each answer's code only the line it
 * names: a workspace lists answers, it never needs the programs again.
 */
export async function readHelpHistory(
  db: Pick<PrismaService, "$queryRaw">,
  input: { academyId: string; userId: string; materialId: string },
): Promise<AiHelpHistoryItem[]> {
  const rows = await db.$queryRaw<HistoryRow[]>(Prisma.sql`
    SELECT r.id, r.level, r.reply, r.analysis, r.source::text AS source, COALESCE(r.submission_id, r.check_id) AS subject_id,
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at, r.reported_at IS NOT NULL AS reported,
      CASE WHEN jsonb_typeof(r.analysis -> 'line') = 'number' AND (r.analysis ->> 'line')::int >= 1
        THEN left(btrim(split_part(COALESCE(s.code, k.code), chr(10), (r.analysis ->> 'line')::int), ' ' || chr(9) || chr(13)), 200) END AS quoted
    FROM ai_help_replies r
    LEFT JOIN submissions s ON s.id = r.submission_id
    LEFT JOIN ai_help_checks k ON k.id = r.check_id
    WHERE r.user_id = ${input.userId}::uuid AND r.material_id = ${input.materialId}::uuid AND r.academy_id = ${input.academyId}::uuid
      AND r.status = 'DONE' AND r.reply IS NOT NULL
    ORDER BY r.created_at DESC, r.level DESC
    LIMIT ${AI_HELP_HISTORY_MAX}`);
  return rows.reverse().flatMap((row) => {
    const source = aiHelpSourceSchema.safeParse(row.source);
    if (!source.success || !row.subject_id) return [];
    const analysis = aiAnalysisSchema.safeParse(row.analysis);
    return [{
      id: row.id, level: row.level, text: row.reply, analysis: analysis.success ? analysis.data : null, createdAt: row.created_at,
      reported: row.reported, source: source.data, subjectId: row.subject_id, quoted: row.quoted || null,
    }];
  });
}
