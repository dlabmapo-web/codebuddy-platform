import {
  solutionCheckResultSchema,
  solutionCheckStatusSchema,
  type NativeRuntimeDescriptor,
  type SolutionCheck,
  type SolutionCheckStatus,
  type SolutionCheckSummary,
} from "@cove/shared";
import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ExerciseGradingSource } from "../judge/grading-profile.js";
import { JudgeQueue, runtimeQueueName, type SolutionCheckJob } from "../judge/judge.queue.js";
import { NativeAdmission } from "../judge/native-admission.js";
import { solutionsDigest } from "../judge/solution-check.js";

/** Checks queued inside a transaction, to dispatch once it has committed. */
export type QueuedSolutionChecks = Array<{ job: SolutionCheckJob; descriptor: NativeRuntimeDescriptor | null }>;

type Definition = {
  material_id: string;
  is_quiz: boolean;
  memory_limit_mb: number;
  time_limit_ms: number;
  grading_revision: number;
  case_limits: Array<number | null>;
  solutions: string[];
  checked_revision: number | null;
  checked_digest: string | null;
};

type CheckRow = {
  material_id: string;
  status: string;
  current: boolean;
  queued_at: Date;
  finished_at: Date | null;
  result: unknown;
};

/**
 * Runs each problem's official solutions against its own test cases after it
 * is saved or imported, so broken test data shows up in the editor instead of
 * in a classroom. Advisory only: nothing here blocks a save or a publish.
 */
@Injectable()
export class SolutionCheckService {
  private readonly logger = new Logger(SolutionCheckService.name);
  private nativeAdmission?: NativeAdmission;
  private native() { return this.nativeAdmission ??= new NativeAdmission(this.config, this.prisma, this.queue ?? undefined); }

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService,
    // A plain optional type: Nest resolves the provider from emitted metadata,
    // and a `| null` union would emit `Object` and inject nothing.
    @Optional() private readonly queue?: JudgeQueue,
  ) {}

  /**
   * Inside the caller's transaction, after its writes: a fresh check for every
   * problem whose grading revision or solutions moved since its last check
   * (every listed problem when `force`). Three statements whatever the count.
   */
  async prepare(tx: Prisma.TransactionClient, academyId: string, materialIds: readonly string[], force = false): Promise<QueuedSolutionChecks> {
    if (!materialIds.length) return [];
    const definitions = await tx.$queryRaw<Definition[]>`
      SELECT pe.material_id::text AS material_id, pe.quiz IS NOT NULL AS is_quiz,
        pe.memory_limit_mb, pe.time_limit_ms, pe.grading_revision,
        COALESCE((SELECT array_agg(tc.time_limit_ms_override ORDER BY tc.position)
          FROM exercise_test_cases tc WHERE tc.exercise_material_id = pe.material_id), '{}') AS case_limits,
        COALESCE((SELECT array_agg(s.code ORDER BY s.position)
          FROM programming_exercise_solutions s WHERE s.material_id = pe.material_id), '{}') AS solutions,
        c.grading_revision AS checked_revision, c.solutions_digest AS checked_digest
      FROM programming_exercises pe
      LEFT JOIN exercise_solution_checks c ON c.material_id = pe.material_id
      WHERE pe.material_id = ANY(${[...materialIds]}::uuid[])`;
    const engineVersion = String(this.config.get("PYODIDE_VERSION") ?? "0.27.5");
    // One academy for every problem here; native admission reads it once.
    let organization: Promise<{ organizationId: string } | null> | undefined;
    const reader = { academy: { findUnique: () => organization ??= tx.academy.findUnique({ where: { id: academyId }, select: { organizationId: true } }) } } as unknown as Pick<Prisma.TransactionClient, "academy">;

    const rows: Prisma.Sql[] = [];
    const queued: QueuedSolutionChecks = [];
    for (const definition of definitions) {
      const digest = solutionsDigest(definition.solutions);
      if (!force && definition.checked_revision === definition.grading_revision && definition.checked_digest === digest) continue;
      const checkId = randomUUID();
      const status: SolutionCheckStatus = definition.is_quiz || !definition.case_limits.length ? "NOT_CHECKABLE"
        : !definition.solutions.length ? "NO_SOLUTION" : "QUEUED";
      let descriptor: NativeRuntimeDescriptor | null = null;
      if (status === "QUEUED") {
        // Routing needs only the limits. A material-specific certificate also
        // matches its exact revision, so the inputs it sizes are not reread.
        const exercise = {
          memoryLimitMb: definition.memory_limit_mb,
          timeLimitMs: definition.time_limit_ms,
          testCases: definition.case_limits.map(limit => ({ timeLimitMsOverride: limit, input: "" })),
        } as unknown as ExerciseGradingSource;
        // A misconfigured native node routes the check to compatibility
        // grading; it must never fail the save that queued it.
        descriptor = await this.native().select({
          academyId, materialId: definition.material_id, gradingRevision: definition.grading_revision,
          context: "preview", kind: "solution-check",
        }, exercise, reader).catch((error: unknown) => {
          this.logger.warn(`solution check native routing unavailable: ${String(error)}`);
          return null;
        });
        queued.push({ job: { materialId: definition.material_id, checkId, memoryLimitMb: definition.memory_limit_mb }, descriptor });
      }
      rows.push(Prisma.sql`(${definition.material_id}::uuid, ${checkId}::uuid, ${definition.grading_revision}, ${digest},
        ${status}::"SolutionCheckStatus", ${engineVersion}, ${status === "QUEUED" ? runtimeQueueName("check", descriptor) : null},
        ${descriptor ? JSON.stringify(descriptor) : null}::jsonb, ${status === "QUEUED" ? null : new Date()}::timestamptz)`);
    }
    if (!rows.length) return [];
    await tx.$executeRaw`
      INSERT INTO exercise_solution_checks (material_id, check_id, grading_revision, solutions_digest, status,
        engine_version, execution_queue, execution_runtime_snapshot, finished_at)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (material_id) DO UPDATE SET check_id = EXCLUDED.check_id,
        grading_revision = EXCLUDED.grading_revision, solutions_digest = EXCLUDED.solutions_digest,
        status = EXCLUDED.status, engine_version = EXCLUDED.engine_version,
        execution_queue = EXCLUDED.execution_queue, execution_runtime_snapshot = EXCLUDED.execution_runtime_snapshot,
        result = NULL, queued_at = CURRENT_TIMESTAMP, started_at = NULL, finished_at = EXCLUDED.finished_at`;
    return queued;
  }

  /**
   * After commit. A failed dispatch leaves the row QUEUED, and the judge's
   * recovery sweep queues it again, so the save that caused it never fails.
   */
  async dispatch(checks: QueuedSolutionChecks): Promise<void> {
    if (!checks.length || !this.queue) return;
    const families = new Map<string, QueuedSolutionChecks>();
    for (const check of checks) {
      const name = runtimeQueueName("check", check.descriptor);
      families.set(name, [...(families.get(name) ?? []), check]);
    }
    await Promise.all([...families.values()].map(async family => {
      try {
        await this.queue!.enqueueSolutionChecks(family.map(check => check.job), family[0]!.descriptor);
      } catch (error) {
        this.logger.warn(`solution check dispatch deferred to recovery: ${String(error)}`);
      }
    }));
  }

  async get(identity: SupabaseIdentity, input: { academyId: string; courseId: string; materialId: string }): Promise<SolutionCheck | null> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    const [row] = await this.prisma.$queryRaw<CheckRow[]>`
      SELECT c.material_id::text AS material_id, c.status::text AS status,
        (c.grading_revision = pe.grading_revision) AS current, c.queued_at, c.finished_at, c.result
      FROM exercise_solution_checks c
      JOIN programming_exercises pe ON pe.material_id = c.material_id
      JOIN materials m ON m.id = c.material_id
      JOIN lectures l ON l.id = m.lecture_id
      JOIN course_modules cm ON cm.id = l.course_module_id
      JOIN courses co ON co.id = cm.course_id
      WHERE c.material_id = ${input.materialId}::uuid AND co.id = ${input.courseId}::uuid AND co.academy_id = ${input.academyId}::uuid`;
    return row ? toSolutionCheck(row) : null;
  }

  async run(identity: SupabaseIdentity, input: { academyId: string; courseId: string; materialId: string }): Promise<SolutionCheck> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    const owned = await this.prisma.programmingExercise.count({
      where: { materialId: input.materialId, material: { lecture: { courseModule: { course: { id: input.courseId, academyId: input.academyId } } } } },
    });
    if (!owned) throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    const queued = await this.prisma.$transaction(tx => this.prepare(tx, input.academyId, [input.materialId], true));
    await this.dispatch(queued);
    const check = await this.get(identity, input);
    if (!check) throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return check;
  }

  async list(identity: SupabaseIdentity, input: { academyId: string; courseId: string }): Promise<SolutionCheckSummary[]> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    const rows = await this.prisma.$queryRaw<Array<{ material_id: string; status: string; result: unknown }>>`
      SELECT c.material_id::text AS material_id, c.status::text AS status,
        CASE WHEN c.status = 'FAILED' THEN c.result END AS result
      FROM exercise_solution_checks c
      JOIN programming_exercises pe ON pe.material_id = c.material_id AND pe.grading_revision = c.grading_revision
      JOIN materials m ON m.id = c.material_id
      JOIN lectures l ON l.id = m.lecture_id
      JOIN course_modules cm ON cm.id = l.course_module_id
      JOIN courses co ON co.id = cm.course_id
      WHERE co.id = ${input.courseId}::uuid AND co.academy_id = ${input.academyId}::uuid`;
    return rows.map(row => ({
      materialId: row.material_id,
      status: solutionCheckStatusSchema.parse(row.status),
      failedPositions: failedPositions(row.result),
    }));
  }
}

function failedPositions(value: unknown): number[] {
  const parsed = solutionCheckResultSchema.safeParse(value);
  if (!parsed.success) return [];
  const positions = new Set<number>();
  for (const solution of parsed.data.solutions) {
    for (const item of solution.cases) {
      if (!["PASSED", "PASSED_WITH_WARNING", "SKIPPED"].includes(item.outcome)) positions.add(item.position);
    }
  }
  return [...positions].sort((left, right) => left - right).slice(0, 50);
}

function toSolutionCheck(row: CheckRow): SolutionCheck {
  const result = solutionCheckResultSchema.safeParse(row.result);
  return {
    materialId: row.material_id,
    status: solutionCheckStatusSchema.parse(row.status),
    current: row.current,
    queuedAt: row.queued_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    result: result.success ? result.data : null,
  };
}
