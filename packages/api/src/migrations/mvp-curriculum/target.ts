import { Pool, type PoolClient } from "pg";

import {
  TARGET_ACADEMY_SLUG,
  TARGET_PROJECT_REF,
  type ApplyCourseResult,
  type MigrationPlan,
  type PlannedCourse,
} from "./types.js";

export interface TargetContext {
  academyId: string;
  academyName: string;
  eligibleActors: Array<{ membershipId: string; userId: string; email: string }>;
}

export class TargetDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    if (!connectionString.includes(TARGET_PROJECT_REF)) {
      throw new Error(`Target database URL must identify approved project ${TARGET_PROJECT_REF}.`);
    }
    this.#pool = new Pool({ connectionString, max: 3, application_name: "cove-mvp-curriculum-migration" });
  }

  async close(): Promise<void> { await this.#pool.end(); }

  async inspect(actorUserId?: string): Promise<TargetContext> {
    const academy = await this.#pool.query<{ id: string; name: string }>(
      `select id, name from academies where slug = $1 and status = 'ACTIVE'`, [TARGET_ACADEMY_SLUG],
    );
    if (academy.rowCount !== 1) throw new Error(`Expected exactly one active academy with slug ${TARGET_ACADEMY_SLUG}; found ${academy.rowCount}.`);
    const academyId = academy.rows[0]!.id;
    const actors = await this.#pool.query<{ membership_id: string; user_id: string; email: string }>(
      `select m.id as membership_id, m.user_id, u.email
         from academy_memberships m join users u on u.id = m.user_id
        where m.academy_id = $1 and m.role = 'TEAM_LEAD' and m.status = 'ACTIVE'
        order by u.email, m.id`, [academyId],
    );
    const eligibleActors = actors.rows.map((row) => ({ membershipId: row.membership_id, userId: row.user_id, email: row.email }));
    if (actorUserId && !eligibleActors.some((actor) => actor.userId === actorUserId)) {
      throw new Error("The selected migration actor is not an active TEAM_LEAD of dlab-mapo.");
    }
    return { academyId, academyName: academy.rows[0]!.name, eligibleActors };
  }

  async revalidatePlanContext(plan: MigrationPlan): Promise<void> {
    const context = await this.inspect(plan.actorUserId);
    if (context.academyId !== plan.targetAcademyId) throw new Error("Target academy changed after dry-run.");
  }

  async assertNoCollisions(plan: MigrationPlan): Promise<void> {
    await this.revalidatePlanContext(plan);
    for (const course of plan.courses) {
      const existing = await this.#pool.query<{ id: string }>(`select id from courses where id = $1`, [course.id]);
      if (existing.rowCount) {
        const mismatches = await this.compareCourse(course, plan.targetAcademyId, plan.actorUserId);
        if (mismatches.length) throw new Error(`Collision for course ${course.id}: ${mismatches.join("; ")}`);
        continue;
      }
      const ids = flattenIds(course);
      const checks: Array<[string, string[]]> = [
        ["course_modules", ids.modules], ["lectures", ids.lectures], ["materials", ids.materials],
        ["exercise_test_cases", ids.testCases], ["exercise_hints", ids.hints],
      ];
      for (const [table, values] of checks) {
        if (!values.length) continue;
        const collision = await this.#pool.query<{ id: string }>(`select id from ${table} where id = any($1::uuid[]) limit 1`, [values]);
        if (collision.rowCount) throw new Error(`Deterministic ID collision in ${table}: ${collision.rows[0]!.id}`);
      }
      const keys = course.modules.flatMap((module) => [module.externalKey, ...module.lectures.flatMap((lecture) => [lecture.externalKey, ...lecture.exercises.map((exercise) => exercise.externalKey)])]);
      if (keys.length) {
        const keyCollision = await this.#pool.query<{ external_key: string }>(
          `select external_key from (
             select external_key from course_modules union all select external_key from lectures union all select external_key from programming_exercises
           ) keys where external_key = any($1::text[]) limit 1`, [keys],
        );
        if (keyCollision.rowCount) throw new Error(`External-key collision: ${keyCollision.rows[0]!.external_key}`);
      }
    }
  }

  async compareCourse(course: PlannedCourse, academyId: string, actorUserId: string): Promise<string[]> {
    const mismatches: string[] = [];
    const courseRow = await this.#pool.query(`select id, academy_id, title, description, is_visible, created_by_user_id, created_at, updated_at from courses where id = $1`, [course.id]);
    if (courseRow.rowCount !== 1) return ["course missing"];
    compareFields(mismatches, "course", courseRow.rows[0], {
      id: course.id, academy_id: academyId, title: course.title, description: course.description,
      is_visible: course.isVisible, created_by_user_id: actorUserId, created_at: course.createdAt, updated_at: course.updatedAt,
    });
    for (const module of course.modules) {
      await compareOne(this.#pool, mismatches, "module", "course_modules", module.id, {
        id: module.id, course_id: course.id, external_key: module.externalKey, title: module.title,
        description: module.description, position: module.position, is_visible: module.isVisible,
        created_at: module.createdAt, updated_at: module.updatedAt,
      });
      for (const lecture of module.lectures) {
        await compareOne(this.#pool, mismatches, "lecture", "lectures", lecture.id, {
          id: lecture.id, course_module_id: module.id, external_key: lecture.externalKey, title: lecture.title,
          description: lecture.description, position: lecture.position, is_visible: lecture.isVisible,
          created_at: lecture.createdAt, updated_at: lecture.updatedAt,
        });
        for (const exercise of lecture.exercises) {
          await compareOne(this.#pool, mismatches, "material", "materials", exercise.materialId, {
            id: exercise.materialId, lecture_id: lecture.id, type: "PROGRAMMING_EXERCISE", title: exercise.title,
            position: exercise.position, is_required: true, is_visible: exercise.isVisible,
            created_at: exercise.createdAt, updated_at: exercise.updatedAt,
          });
          await compareOne(this.#pool, mismatches, "exercise", "programming_exercises", exercise.materialId, {
            material_id: exercise.materialId, external_key: exercise.externalKey, legacy_problem_no: exercise.legacyProblemNo,
            difficulty: exercise.difficulty, description: exercise.description, input_format: exercise.inputFormat,
            output_format: exercise.outputFormat, constraints: exercise.constraints, starter_code: exercise.starterCode,
            language: "PYTHON", time_limit_ms: exercise.timeLimitMs, memory_limit_mb: exercise.memoryLimitMb,
            ai_feedback_enabled: exercise.aiFeedbackEnabled, grading_revision: 1,
            created_at: exercise.createdAt, updated_at: exercise.updatedAt,
          }, "material_id");
          for (const testCase of exercise.testCases) await compareOne(this.#pool, mismatches, "test case", "exercise_test_cases", testCase.id, {
            id: testCase.id, exercise_material_id: exercise.materialId, position: testCase.position,
            input: testCase.input, expected_output: testCase.expectedOutput, visibility: testCase.visibility,
            created_at: testCase.createdAt, updated_at: testCase.updatedAt,
          });
          for (const hint of exercise.hints) await compareOne(this.#pool, mismatches, "hint", "exercise_hints", hint.id, {
            id: hint.id, exercise_material_id: exercise.materialId, position: hint.position,
            content: hint.content, trigger_expression: hint.triggerExpression,
            created_at: hint.createdAt, updated_at: hint.updatedAt,
          });
        }
      }
    }
    const expected = flattenIds(course);
    const actualCounts = await this.#pool.query<{
      modules: string; lectures: string; materials: string; test_cases: string; hints: string;
    }>(
      `select
         (select count(*) from course_modules where course_id = $1)::text as modules,
         (select count(*) from lectures l join course_modules m on m.id = l.course_module_id where m.course_id = $1)::text as lectures,
         (select count(*) from materials x join lectures l on l.id = x.lecture_id join course_modules m on m.id = l.course_module_id where m.course_id = $1)::text as materials,
         (select count(*) from exercise_test_cases t join materials x on x.id = t.exercise_material_id join lectures l on l.id = x.lecture_id join course_modules m on m.id = l.course_module_id where m.course_id = $1)::text as test_cases,
         (select count(*) from exercise_hints h join materials x on x.id = h.exercise_material_id join lectures l on l.id = x.lecture_id join course_modules m on m.id = l.course_module_id where m.course_id = $1)::text as hints`,
      [course.id],
    );
    const counts = actualCounts.rows[0]!;
    const expectedCounts = {
      modules: expected.modules.length, lectures: expected.lectures.length, materials: expected.materials.length,
      test_cases: expected.testCases.length, hints: expected.hints.length,
    };
    for (const [name, count] of Object.entries(expectedCounts)) {
      if (Number(counts[name as keyof typeof counts]) !== count) mismatches.push(`course ${course.id} ${name} count`);
    }
    return mismatches;
  }

  async applyCourse(course: PlannedCourse, plan: MigrationPlan): Promise<ApplyCourseResult> {
    const existing = await this.#pool.query(`select id from courses where id = $1`, [course.id]);
    if (existing.rowCount) {
      const mismatches = await this.compareCourse(course, plan.targetAcademyId, plan.actorUserId);
      if (mismatches.length) throw new Error(`Existing course differs: ${mismatches.join("; ")}`);
      return resultFor(course, "already-present");
    }
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await insertCourse(client, course, plan.targetAcademyId, plan.actorUserId);
      await client.query("commit");
      return resultFor(course, "inserted");
    } catch (caught) {
      await client.query("rollback");
      throw caught;
    } finally { client.release(); }
  }

  async verify(plan: MigrationPlan): Promise<Array<{ courseId: string; mismatches: string[] }>> {
    const results = [];
    for (const course of plan.courses) results.push({ courseId: course.id, mismatches: await this.compareCourse(course, plan.targetAcademyId, plan.actorUserId) });
    const ids = plan.courses.map((course) => course.id);
    const outside = ids.length ? await this.#pool.query<{ id: string }>(`select id from courses where id = any($1::uuid[]) and academy_id <> $2`, [ids, plan.targetAcademyId]) : { rows: [] };
    if (outside.rows.length) results.push({ courseId: "outside-academy", mismatches: outside.rows.map((row) => row.id) });
    return results;
  }

  async rollbackCourse(course: PlannedCourse, academyId: string, actorUserId: string): Promise<void> {
    const mismatches = await this.compareCourse(course, academyId, actorUserId);
    if (mismatches.length) throw new Error(`Refusing rollback of changed course ${course.id}: ${mismatches.join("; ")}`);
    const ids = flattenIds(course);
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      if (ids.hints.length) await client.query(`delete from exercise_hints where id = any($1::uuid[])`, [ids.hints]);
      if (ids.testCases.length) await client.query(`delete from exercise_test_cases where id = any($1::uuid[])`, [ids.testCases]);
      if (ids.materials.length) await client.query(`delete from programming_exercises where material_id = any($1::uuid[])`, [ids.materials]);
      if (ids.materials.length) await client.query(`delete from materials where id = any($1::uuid[])`, [ids.materials]);
      if (ids.lectures.length) await client.query(`delete from lectures where id = any($1::uuid[])`, [ids.lectures]);
      if (ids.modules.length) await client.query(`delete from course_modules where id = any($1::uuid[])`, [ids.modules]);
      await client.query(`delete from courses where id = $1 and academy_id = $2`, [course.id, academyId]);
      await client.query("commit");
    } catch (caught) { await client.query("rollback"); throw caught; } finally { client.release(); }
  }
}

export function normalizeDatabaseValue(value: unknown, field: string): unknown {
  if (field === "created_at" || field === "updated_at") {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") {
      const timestamp = Date.parse(value);
      if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString();
    }
  }
  return value instanceof Date ? value.toISOString() : value;
}

function compareFields(mismatches: string[], label: string, actual: Record<string, unknown>, expected: Record<string, unknown>): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (normalizeDatabaseValue(actual[key], key) !== normalizeDatabaseValue(expectedValue, key)) {
      mismatches.push(`${label} ${String(expected.id ?? expected.material_id)} field ${key}`);
    }
  }
}

async function compareOne(pool: Pool, mismatches: string[], label: string, table: string, id: string, expected: Record<string, unknown>, idColumn = "id"): Promise<void> {
  const result = await pool.query(`select * from ${table} where ${idColumn} = $1`, [id]);
  if (result.rowCount !== 1) { mismatches.push(`${label} ${id} missing`); return; }
  compareFields(mismatches, label, result.rows[0], expected);
}

function flattenIds(course: PlannedCourse) {
  const modules: string[] = [], lectures: string[] = [], materials: string[] = [], testCases: string[] = [], hints: string[] = [];
  for (const module of course.modules) { modules.push(module.id); for (const lecture of module.lectures) {
    lectures.push(lecture.id); for (const exercise of lecture.exercises) {
      materials.push(exercise.materialId); testCases.push(...exercise.testCases.map((row) => row.id)); hints.push(...exercise.hints.map((row) => row.id));
    }
  }}
  return { modules, lectures, materials, testCases, hints };
}

function resultFor(course: PlannedCourse, status: "inserted" | "already-present"): ApplyCourseResult {
  const ids = flattenIds(course);
  return {
    courseId: course.id, sourceId: course.sourceId, status, fingerprint: course.fingerprint,
    insertedIds: status === "inserted" ? {
      subjects: [course.id], stages: ids.modules, chapters: ids.lectures, problems: ids.materials,
      test_cases: ids.testCases, problem_hints: ids.hints, materials: ids.materials,
    } : { subjects: [], stages: [], chapters: [], problems: [], test_cases: [], problem_hints: [], materials: [] },
  };
}

async function insertCourse(client: PoolClient, course: PlannedCourse, academyId: string, actorUserId: string): Promise<void> {
  await client.query(`insert into courses (id, academy_id, title, description, is_visible, content_revision, created_by_user_id, created_at, updated_at) values ($1,$2,$3,$4,$5,1,$6,$7,$8)`,
    [course.id, academyId, course.title, course.description, course.isVisible, actorUserId, course.createdAt, course.updatedAt]);
  for (const module of course.modules) {
    await client.query(`insert into course_modules (id, course_id, external_key, title, description, position, is_visible, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [module.id, course.id, module.externalKey, module.title, module.description, module.position, module.isVisible, module.createdAt, module.updatedAt]);
    for (const lecture of module.lectures) {
      await client.query(`insert into lectures (id, course_module_id, external_key, title, description, position, is_visible, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [lecture.id, module.id, lecture.externalKey, lecture.title, lecture.description, lecture.position, lecture.isVisible, lecture.createdAt, lecture.updatedAt]);
      for (const exercise of lecture.exercises) {
        await client.query(`insert into materials (id, lecture_id, type, title, position, is_required, is_visible, created_at, updated_at) values ($1,$2,'PROGRAMMING_EXERCISE',$3,$4,true,$5,$6,$7)`,
          [exercise.materialId, lecture.id, exercise.title, exercise.position, exercise.isVisible, exercise.createdAt, exercise.updatedAt]);
        await client.query(`insert into programming_exercises (material_id, external_key, legacy_problem_no, difficulty, description, input_format, output_format, constraints, starter_code, language, time_limit_ms, memory_limit_mb, ai_feedback_enabled, grading_revision, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PYTHON',$10,$11,$12,1,$13,$14)`,
          [exercise.materialId, exercise.externalKey, exercise.legacyProblemNo, exercise.difficulty, exercise.description, exercise.inputFormat, exercise.outputFormat, exercise.constraints, exercise.starterCode, exercise.timeLimitMs, exercise.memoryLimitMb, exercise.aiFeedbackEnabled, exercise.createdAt, exercise.updatedAt]);
        for (const row of exercise.testCases) await client.query(`insert into exercise_test_cases (id, exercise_material_id, position, input, expected_output, visibility, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.id, exercise.materialId, row.position, row.input, row.expectedOutput, row.visibility, row.createdAt, row.updatedAt]);
        for (const row of exercise.hints) await client.query(`insert into exercise_hints (id, exercise_material_id, position, content, trigger_expression, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7)`,
          [row.id, exercise.materialId, row.position, row.content, row.triggerExpression, row.createdAt, row.updatedAt]);
      }
    }
  }
}
