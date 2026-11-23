import { examItemsSnapshotSchema, type ExamItemSnapshot, type ExamItemType } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";

/**
 * Raw readers for exams. Each is one statement (AGENTS.md): the test card,
 * the attempt shell, the staff page and the results grid never issue a query
 * per item or per student.
 */

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

export type ExamLectureItem = {
  materialId: string;
  title: string;
  materialType: string;
  position: number;
  isVisible: boolean;
  isQuiz: boolean;
};

export function itemTypeOf(item: { materialType: string; isQuiz: boolean }): ExamItemType | null {
  if (item.materialType === "PROGRAMMING_EXERCISE") return item.isQuiz ? "QUIZ" : "CODE";
  if (item.materialType === "MULTIPLE_CHOICE") return "MULTIPLE_CHOICE";
  if (item.materialType === "WRITTEN_RESPONSE") return "SHORT_ANSWER";
  return null;
}

export type ExamSettingsRow = {
  guide: string;
  summary: string;
  testType: "NONE" | "DIAGNOSTIC" | "FORMATIVE" | "SUMMATIVE";
  timeLimitMinutes: number | null;
  usePreparation: boolean;
  reviewAfterEnd: boolean;
  allowSelfRetake: boolean;
  showScoreOnFinish: boolean;
  points: Record<string, number>;
};

export type AttemptRow = {
  id: string;
  lectureId: string;
  classId: string;
  userId: string;
  attemptNo: number;
  startedAt: Date;
  deadlineAt: Date | null;
  endedAt: Date | null;
  endReason: "STUDENT" | "TIME_UP" | "PERIOD_CLOSED" | "STAFF" | null;
  retakeGrantedAt: Date | null;
  itemsSnapshot: ExamItemSnapshot[];
};

export type ScheduleRow = { opensAt: Date | null; closesAt: Date | null; resultsReleasedAt: Date | null };

function date(value: unknown): Date | null {
  return value == null ? null : new Date(value as string);
}

export function toAttempt(raw: Record<string, unknown>): AttemptRow {
  return {
    id: raw.id as string,
    lectureId: raw.lecture_id as string,
    classId: raw.class_id as string,
    userId: raw.user_id as string,
    attemptNo: raw.attempt_no as number,
    startedAt: new Date(raw.started_at as string),
    deadlineAt: date(raw.deadline_at),
    endedAt: date(raw.ended_at),
    endReason: (raw.end_reason as AttemptRow["endReason"]) ?? null,
    retakeGrantedAt: date(raw.retake_granted_at),
    itemsSnapshot: examItemsSnapshotSchema.parse(raw.items_snapshot),
  };
}

export function toSchedule(raw: Record<string, unknown> | null): ScheduleRow {
  return {
    opensAt: date(raw?.opens_at),
    closesAt: date(raw?.closes_at),
    resultsReleasedAt: date(raw?.results_released_at),
  };
}

export function toSettings(raw: Record<string, unknown>): ExamSettingsRow {
  return {
    guide: raw.guide as string,
    summary: raw.summary as string,
    testType: raw.test_type as ExamSettingsRow["testType"],
    timeLimitMinutes: (raw.time_limit_minutes as number | null) ?? null,
    usePreparation: raw.use_preparation as boolean,
    reviewAfterEnd: raw.review_after_end as boolean,
    allowSelfRetake: raw.allow_self_retake as boolean,
    showScoreOnFinish: Boolean(raw.show_score_on_finish),
    points: (raw.points as Record<string, number>) ?? {},
  };
}

function toItems(raw: unknown): ExamLectureItem[] {
  return ((raw as Array<Record<string, unknown>>) ?? []).map((item) => ({
    materialId: item.id as string,
    title: item.title as string,
    materialType: item.type as string,
    position: item.position as number,
    isVisible: item.is_visible as boolean,
    isQuiz: Boolean(item.is_quiz),
  }));
}

const itemsSql = (lecture: Prisma.Sql) => Prisma.sql`COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'type',m.type,
    'position',m.position,'is_visible',m.is_visible,'is_quiz',pe.quiz IS NOT NULL) ORDER BY m.position, m.id)
  FROM materials m LEFT JOIN programming_exercises pe ON pe.material_id = m.id WHERE m.lecture_id = ${lecture}), '[]'::jsonb)`;

/** The student's test card: one statement. */
export async function readStudentTest(db: Db, input: { academyId: string; classId: string; lectureId: string; userId: string }) {
  const [row] = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT l.id, l.title, cm.course_id, (l.is_visible AND cm.is_visible AND c.is_visible) AS visible,
      to_jsonb(lt) AS test, to_jsonb(clt) AS schedule,
      ${itemsSql(Prisma.sql`l.id`)} AS items,
      EXISTS (SELECT 1 FROM academy_feature_flags f WHERE f.academy_id = c.academy_id AND f.feature = 'EXAMS' AND f.is_enabled) AS feature_on,
      EXISTS (
        SELECT 1 FROM classes k
        JOIN class_courses cc ON cc.class_id = k.id AND cc.course_id = c.id
        JOIN class_enrollments ce ON ce.class_id = k.id
        JOIN academy_memberships am ON am.id = ce.membership_id
        WHERE k.id = ${input.classId}::uuid AND k.academy_id = c.academy_id AND k.status = 'ACTIVE'
          AND am.user_id = ${input.userId}::uuid AND am.academy_id = c.academy_id AND am.status = 'ACTIVE'
      ) AS enrolled,
      (SELECT to_jsonb(a) FROM test_attempts a WHERE a.class_id = ${input.classId}::uuid AND a.lecture_id = l.id
        AND a.user_id = ${input.userId}::uuid ORDER BY a.attempt_no DESC LIMIT 1) AS latest,
      now() AS server_now
    FROM lectures l
    JOIN lecture_tests lt ON lt.lecture_id = l.id
    JOIN course_modules cm ON cm.id = l.course_module_id
    JOIN courses c ON c.id = cm.course_id
    LEFT JOIN class_lecture_tests clt ON clt.class_id = ${input.classId}::uuid AND clt.lecture_id = l.id
    WHERE l.id = ${input.lectureId}::uuid AND l.kind = 'TEST' AND c.academy_id = ${input.academyId}::uuid
  `);
  if (!row) return null;
  return {
    lectureId: row.id as string,
    title: row.title as string,
    courseId: row.course_id as string,
    visible: row.visible as boolean,
    settings: toSettings(row.test as Record<string, unknown>),
    schedule: toSchedule(row.schedule as Record<string, unknown> | null),
    items: toItems(row.items),
    featureOn: row.feature_on as boolean,
    enrolled: row.enrolled as boolean,
    latest: row.latest ? toAttempt(row.latest as Record<string, unknown>) : null,
    serverNow: new Date(row.server_now as string),
  };
}

/** One attempt with its test, owner-checked by the caller: one statement. */
export async function readAttempt(db: Db, input: { academyId: string; attemptId: string }) {
  const [row] = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT to_jsonb(a) AS attempt, l.title, cm.course_id, to_jsonb(lt) AS test, to_jsonb(clt) AS schedule,
      ${itemsSql(Prisma.sql`l.id`)} AS items, now() AS server_now
    FROM test_attempts a
    JOIN lectures l ON l.id = a.lecture_id
    JOIN lecture_tests lt ON lt.lecture_id = l.id
    JOIN course_modules cm ON cm.id = l.course_module_id
    JOIN courses c ON c.id = cm.course_id
    LEFT JOIN class_lecture_tests clt ON clt.class_id = a.class_id AND clt.lecture_id = a.lecture_id
    WHERE a.id = ${input.attemptId}::uuid AND c.academy_id = ${input.academyId}::uuid
  `);
  if (!row) return null;
  return {
    attempt: toAttempt(row.attempt as Record<string, unknown>),
    title: row.title as string,
    courseId: row.course_id as string,
    settings: toSettings(row.test as Record<string, unknown>),
    schedule: toSchedule(row.schedule as Record<string, unknown> | null),
    items: toItems(row.items),
    serverNow: new Date(row.server_now as string),
  };
}

export type LastSubmission = {
  attemptId: string;
  materialId: string;
  submissionId: string;
  createdAt: Date;
  count: number;
  manual: boolean;
  /** Earned ÷ possible on the problem's own scale; null while still grading. */
  fraction: number | null;
  /** Code, a choice id, the selected option ids as JSON, or the text answer. */
  answer: string;
};

/**
 * The last submission of each (attempt, problem), from both submission
 * tables, with how many there were and the grading fraction. One statement
 * for any number of attempts.
 */
export async function readLastSubmissions(db: Db, attemptIds: readonly string[]): Promise<LastSubmission[]> {
  if (!attemptIds.length) return [];
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT * FROM (
      SELECT DISTINCT ON (s.test_attempt_id, s.source_material_id)
        s.test_attempt_id AS attempt_id, s.source_material_id AS material_id, s.id AS submission_id, s.created_at,
        (count(*) OVER (PARTITION BY s.test_attempt_id, s.source_material_id))::int AS n, false AS manual,
        CASE
          WHEN s.submission_policy = 'MANUAL_REVIEW' THEN CASE WHEN s.manual_review_result->>'state' = 'GRADED'
            THEN (s.manual_review_result->>'scoreHundredths')::numeric / NULLIF((s.manual_assessment_snapshot->>'maximumHundredths')::numeric, 0) END
          WHEN s.status IN ('QUEUED', 'RUNNING', 'ERRORED', 'RECORDED') THEN NULL
          WHEN s.status = 'CANCELLED' THEN 0
          WHEN s.applied_score_hundredths IS NOT NULL AND s.material_maximum_hundredths > 0
            THEN s.applied_score_hundredths::numeric / s.material_maximum_hundredths
          ELSE COALESCE(s.score, 0)::numeric / 100
        END::float8 AS fraction,
        s.code AS answer
      FROM submissions s
      WHERE s.test_attempt_id = ANY(${[...attemptIds]}::uuid[])
      ORDER BY s.test_attempt_id, s.source_material_id, s.created_at DESC, s.id DESC
    ) p
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (ms.test_attempt_id, ms.material_id)
        ms.test_attempt_id, ms.material_id, ms.id, ms.created_at,
        (count(*) OVER (PARTITION BY ms.test_attempt_id, ms.material_id))::int, true,
        CASE
          WHEN mr.score_hundredths IS NOT NULL THEN mr.score_hundredths::numeric / NULLIF(ms.maximum_hundredths, 0)
          WHEN mca.submission_id IS NOT NULL THEN mca.score_hundredths::numeric / NULLIF(ms.maximum_hundredths, 0)
          WHEN saa.status = 'GRADED' THEN saa.score_hundredths::numeric / NULLIF(ms.maximum_hundredths, 0)
          ELSE NULL
        END::float8,
        CASE WHEN mca.submission_id IS NOT NULL THEN mca.selected_option_ids::text ELSE ms.answer END
      FROM manual_submissions ms
      LEFT JOIN multiple_choice_assessments mca ON mca.submission_id = ms.id
      LEFT JOIN short_answer_assessments saa ON saa.submission_id = ms.id
      LEFT JOIN LATERAL (SELECT r.score_hundredths FROM manual_reviews r WHERE r.submission_id = ms.id
        ORDER BY r.version DESC LIMIT 1) mr ON true
      WHERE ms.test_attempt_id = ANY(${[...attemptIds]}::uuid[])
      ORDER BY ms.test_attempt_id, ms.material_id, ms.created_at DESC, ms.id DESC
    ) m
  `);
  return rows.map((row) => ({
    attemptId: row.attempt_id as string,
    materialId: row.material_id as string,
    submissionId: row.submission_id as string,
    createdAt: new Date(row.created_at as string),
    count: row.n as number,
    manual: row.manual as boolean,
    fraction: row.fraction == null ? null : Number(row.fraction),
    answer: (row.answer as string) ?? "",
  }));
}

/** The staff test page: lecture, settings, items and whether anyone sat it. */
export async function readStaffTest(db: Db, input: { academyId: string; courseId: string; lectureId: string }) {
  const [row] = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT l.id, l.title, l.is_visible, l.kind, cm.id AS module_id, cm.course_id, to_jsonb(lt) AS test,
      ${itemsSql(Prisma.sql`l.id`)} AS items,
      (SELECT count(*) FROM test_attempts a WHERE a.lecture_id = l.id)::int AS attempt_count,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('class_id', k.id, 'name', k.name,
          'taken', (SELECT count(DISTINCT a.user_id) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id),
          'ended', (SELECT count(DISTINCT a.user_id) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id
            AND (a.ended_at IS NOT NULL OR a.deadline_at <= now())),
          'in_progress', (SELECT count(*) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id
            AND a.ended_at IS NULL AND (a.deadline_at IS NULL OR a.deadline_at > now()))) ORDER BY k.name, k.id)
        FROM class_courses cc JOIN classes k ON k.id = cc.class_id
        WHERE cc.course_id = cm.course_id AND k.status = 'ACTIVE'), '[]'::jsonb) AS classes
    FROM lectures l
    JOIN course_modules cm ON cm.id = l.course_module_id
    JOIN courses c ON c.id = cm.course_id
    LEFT JOIN lecture_tests lt ON lt.lecture_id = l.id
    WHERE l.id = ${input.lectureId}::uuid AND cm.course_id = ${input.courseId}::uuid AND c.academy_id = ${input.academyId}::uuid
  `);
  if (!row) return null;
  return {
    lectureId: row.id as string,
    title: row.title as string,
    isVisible: row.is_visible as boolean,
    kind: row.kind as "STANDARD" | "TEST",
    moduleId: row.module_id as string,
    courseId: row.course_id as string,
    settings: row.test ? toSettings(row.test as Record<string, unknown>) : null,
    items: toItems(row.items),
    attemptCount: row.attempt_count as number,
    classes: (row.classes as Array<Record<string, unknown>>).map((k) => ({
      classId: k.class_id as string, name: k.name as string,
      taken: Number(k.taken), ended: Number(k.ended), inProgress: Number(k.in_progress),
    })),
  };
}

/** Everything the results page needs, in one statement. */
export async function readResults(db: Db, input: { academyId: string; classId: string; lectureId: string }) {
  const [row] = await db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT l.id, l.title, cm.course_id, k.name AS class_name, to_jsonb(lt) AS test, to_jsonb(clt) AS schedule,
      ${itemsSql(Prisma.sql`l.id`)} AS items,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', am.user_id, 'membership_id', am.id,
          'name', COALESCE(NULLIF(u.display_name, ''), u.username, u.email, ''), 'username', u.username) ORDER BY
          COALESCE(NULLIF(u.display_name, ''), u.username, u.email, ''), am.id)
        FROM class_enrollments ce JOIN academy_memberships am ON am.id = ce.membership_id
        JOIN users u ON u.id = am.user_id
        WHERE ce.class_id = k.id AND am.academy_id = k.academy_id AND am.status = 'ACTIVE'
          AND (am.role = 'STUDENT' OR EXISTS (SELECT 1 FROM academy_membership_roles r WHERE r.membership_id = am.id AND r.role = 'STUDENT'))
      ), '[]'::jsonb) AS students,
      COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.user_id, a.attempt_no)
        FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id), '[]'::jsonb) AS attempts,
      now() AS server_now
    FROM lectures l
    JOIN lecture_tests lt ON lt.lecture_id = l.id
    JOIN course_modules cm ON cm.id = l.course_module_id
    JOIN courses c ON c.id = cm.course_id
    JOIN classes k ON k.id = ${input.classId}::uuid AND k.academy_id = c.academy_id
    JOIN class_courses cc ON cc.class_id = k.id AND cc.course_id = c.id
    LEFT JOIN class_lecture_tests clt ON clt.class_id = k.id AND clt.lecture_id = l.id
    WHERE l.id = ${input.lectureId}::uuid AND l.kind = 'TEST' AND c.academy_id = ${input.academyId}::uuid
  `);
  if (!row) return null;
  return {
    lectureId: row.id as string,
    title: row.title as string,
    courseId: row.course_id as string,
    className: row.class_name as string,
    settings: toSettings(row.test as Record<string, unknown>),
    schedule: toSchedule(row.schedule as Record<string, unknown> | null),
    items: toItems(row.items),
    students: (row.students as Array<Record<string, unknown>>).map((s) => ({
      userId: s.user_id as string,
      membershipId: s.membership_id as string,
      name: s.name as string,
      username: (s.username as string | null) ?? null,
    })),
    attempts: (row.attempts as Array<Record<string, unknown>>).map(toAttempt),
    serverNow: new Date(row.server_now as string),
  };
}

/** The tests a class sits, across its courses, with attempt counts. One statement. */
export async function readClassTests(db: Db, input: { academyId: string; classId: string }) {
  return db.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT l.id, l.title, c.id AS course_id, c.title AS course_title, lt.time_limit_minutes, to_jsonb(clt) AS schedule,
      (SELECT count(*) FROM materials m WHERE m.lecture_id = l.id AND m.is_visible)::int AS item_count,
      (SELECT count(DISTINCT a.user_id) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id)::int AS taken,
      (SELECT count(DISTINCT a.user_id) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id
        AND (a.ended_at IS NOT NULL OR a.deadline_at <= now()))::int AS ended,
      (SELECT count(*) FROM test_attempts a WHERE a.class_id = k.id AND a.lecture_id = l.id
        AND a.ended_at IS NULL AND (a.deadline_at IS NULL OR a.deadline_at > now()))::int AS in_progress,
      now() AS server_now
    FROM classes k
    JOIN class_courses cc ON cc.class_id = k.id
    JOIN courses c ON c.id = cc.course_id AND c.academy_id = k.academy_id
    JOIN course_modules cm ON cm.course_id = c.id
    JOIN lectures l ON l.course_module_id = cm.id AND l.kind = 'TEST'
    JOIN lecture_tests lt ON lt.lecture_id = l.id
    LEFT JOIN class_lecture_tests clt ON clt.class_id = k.id AND clt.lecture_id = l.id
    WHERE k.id = ${input.classId}::uuid AND k.academy_id = ${input.academyId}::uuid
    ORDER BY c.title, cm.position, l.position
  `);
}
