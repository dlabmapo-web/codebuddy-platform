import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { ConfigService } from "@nestjs/config";
import { Client } from "pg";

import type { SupabaseIdentity } from "../../auth/auth.types.js";
import type { ApiEnvironment } from "../../config/env.schema.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { ExecutionEngine, ExecutionResult } from "../../judge/execution-engine.js";
import { AiHelpCheckRunner } from "../../judge/ai-help-check.runner.js";
import { ExecutionCapacity } from "../../judge/execution-capacity.js";
import { GradingService } from "../../judge/grading.service.js";
import type { JudgeQueue } from "../../judge/judge.queue.js";
import { LibraryCheckRunner } from "../../judge/library-check.runner.js";

/**
 * One academy with a class, a student and a Python problem, in a disposable
 * database. Programs run in a table-driven engine: no interpreter, no network.
 */
type Program = (stdin: string) => string | { error: string } | { kind: "TIME_LIMIT" };

export class TableEngine implements ExecutionEngine {
  readonly version = "pyodide-0.27.5";
  readonly programs = new Map<string, Program>();
  runs = 0;
  async dispose(): Promise<void> {}
  async run(input: { code: string; stdin: string }): Promise<ExecutionResult> {
    this.runs++;
    const program = this.programs.get(input.code);
    const out = program ? program(input.stdin) : { error: "NameError: name 'x' is not defined" };
    if (typeof out === "string") return { stdout: out, stderr: "", outcome: "PASSED", runtimeMs: 1 };
    if ("kind" in out) return { stdout: "", stderr: "", outcome: out.kind, runtimeMs: 1 };
    return {
      stdout: "", outcome: "RUNTIME_ERROR", runtimeMs: 1,
      stderr: `Traceback (most recent call last):\n  File "main.py", line 1, in <module>\n${out.error}\n`,
    };
  }
}

export async function createAiFixture(databaseUrl: string, env: Record<string, unknown> = {}, options: { alone?: boolean } = {}) {
  // The job reads every academy, so specs sharing a database take turns. The
  // lock is the session's: it ends with the connection, however a run ends.
  const turn = options.alone === false ? null : new Client({ connectionString: databaseUrl });
  if (turn) {
    await turn.connect();
    await turn.query("SELECT pg_advisory_lock(7261901)");
    await turn.query(`UPDATE academy_feature_flags SET is_enabled = false WHERE feature = 'AI_ASSISTANT'`);
    await turn.query("DELETE FROM ai_libraries");
    // A failed run's queued checks would otherwise be sent again into this one.
    await turn.query("DELETE FROM ai_library_checks");
    await turn.query("DELETE FROM ai_usage_months");
    await turn.query("DELETE FROM ai_help_checks");
  }
  const config = new ConfigService({
    DATABASE_URL: databaseUrl, PYODIDE_VERSION: "0.27.5", SUBMISSION_RATE_LIMIT: 60,
    AI_ASSISTANT_ENABLED: true, AI_ASSISTANT_MODEL: "fake", AI_ASSISTANT_EFFORT: "none", AI_ASSISTANT_TIMEOUT_MS: 2_000,
    AI_ASSISTANT_MAX_OUTPUT_TOKENS: 400, AI_ASSISTANT_CONCURRENCY: 8, AI_ASSISTANT_PROBLEM_LIMIT: 3, AI_ASSISTANT_DAILY_LIMIT: 10,
    AI_ASSISTANT_MONTHLY_BUDGET_USD: 5, AI_ASSISTANT_INPUT_USD_PER_MTOK: 0.1, AI_ASSISTANT_OUTPUT_USD_PER_MTOK: 0.5,
    AI_LIBRARY_ENABLED: true, AI_LIBRARY_MODEL: "fake", AI_LIBRARY_EFFORT: "low", AI_LIBRARY_MONTHLY_BUDGET_USD: 10,
    AI_LIBRARY_INPUT_USD_PER_MTOK: 0.1, AI_LIBRARY_OUTPUT_USD_PER_MTOK: 0.5, AI_LIBRARY_HOURS: "0-24",
    AI_LIBRARY_QUIET_MINUTES: 0, AI_LIBRARY_SEND_SOLUTIONS: true, AI_HELP_RETENTION_DAYS: 180, ...env,
  }) as unknown as ConfigService<ApiEnvironment, true>;
  const prisma = new PrismaService(config as never);
  const ids = {
    organization: randomUUID(), academy: randomUUID(), manager: randomUUID(), student: randomUUID(), other: randomUUID(),
    klass: randomUUID(), course: randomUUID(), module: randomUUID(), lecture: randomUUID(),
    managerMembership: randomUUID(), studentMembership: randomUUID(), otherMembership: randomUUID(),
  };
  const auth = { manager: randomUUID(), student: randomUUID(), other: randomUUID() };
  const identity = (authUserId: string) => ({ authUserId, email: `${authUserId}@it.test` }) as SupabaseIdentity;
  const tag = ids.academy.slice(0, 8);

  await prisma.organization.create({ data: { id: ids.organization, name: "AI", slug: `ai-${tag}` } });
  await prisma.academy.create({ data: { id: ids.academy, organizationId: ids.organization, name: "AI", slug: `ai-${tag}`, status: "ACTIVE" } });
  await prisma.user.createMany({
    data: ([["manager", ids.manager], ["student", ids.student], ["other", ids.other]] as const).map(([role, id]) => ({
      id, authUserId: auth[role], status: "ACTIVE" as const, email: `${auth[role]}@it.test`, username: `${role[0]}${id.slice(0, 7)}`, displayName: `SECRETNAME ${role}`,
    })),
  });
  await prisma.academyMembership.createMany({
    data: [
      { id: ids.managerMembership, academyId: ids.academy, userId: ids.manager, role: "MANAGER", status: "ACTIVE" },
      { id: ids.studentMembership, academyId: ids.academy, userId: ids.student, role: "STUDENT", status: "ACTIVE" },
      { id: ids.otherMembership, academyId: ids.academy, userId: ids.other, role: "STUDENT", status: "ACTIVE" },
    ],
  });
  await prisma.academyFeatureFlag.create({ data: { academyId: ids.academy, feature: "AI_ASSISTANT", isEnabled: true } });
  // An AI course (the campus courses design, §4).
  await prisma.course.create({ data: { id: ids.course, academyId: ids.academy, title: "Course", isVisible: true, aiTeacherEnabled: true, createdByUserId: ids.manager } });
  await prisma.courseModule.create({ data: { id: ids.module, courseId: ids.course, title: "M", position: 1, isVisible: true, externalKey: randomUUID() } as never });
  await prisma.lecture.create({ data: { id: ids.lecture, courseModuleId: ids.module, title: "L", position: 1, isVisible: true, externalKey: randomUUID() } });
  await prisma.class.create({ data: { id: ids.klass, academyId: ids.academy, name: "Class", createdByUserId: ids.manager } });
  await prisma.classCourse.create({ data: { classId: ids.klass, courseId: ids.course, assignedByUserId: ids.manager } });
  await prisma.classEnrollment.createMany({
    data: [ids.studentMembership, ids.otherMembership].map((membershipId) => ({ classId: ids.klass, membershipId, enrolledByUserId: ids.manager })),
  });

  let position = 0;
  /** Print the bigger of two numbers: two public cases, two hidden. */
  const createExercise = async (over: Record<string, unknown> = {}, solution: string | null = "SOLUTION_SENTINEL") => {
    const materialId = randomUUID();
    await prisma.material.create({
      data: { id: materialId, lectureId: ids.lecture, type: "PROGRAMMING_EXERCISE", title: "Bigger", position: ++position, isVisible: true },
    });
    await prisma.programmingExercise.create({
      data: {
        materialId, externalKey: randomUUID(), difficulty: "EASY", description: `<p>Print the <b>bigger</b> number.</p><!-- ${tag} -->`,
        aiFeedbackEnabled: true, ...over,
      },
    });
    await prisma.exerciseTestCase.createMany({
      data: ([["2\n5", "5", "SAMPLE"], ["9\n4", "9", "SAMPLE"], ["111222\n333444", "333444", "HIDDEN"], ["8\n1", "8", "HIDDEN"]] as const)
        .map(([input, expectedOutput, visibility], index) => ({ exerciseMaterialId: materialId, position: index + 1, input, expectedOutput, visibility })),
    });
    if (solution) await prisma.programmingExerciseSolution.create({ data: { materialId, position: 1, code: solution } });
    return materialId;
  };

  const engine = new TableEngine();
  const numbers = (stdin: string) => stdin.split("\n").map(Number) as [number, number];
  engine.programs.set("SOLUTION_SENTINEL", (stdin) => `${Math.max(...numbers(stdin))}\n`);
  const grading = new GradingService(prisma, engine, { award: async () => undefined } as never, undefined as never);
  const checks = new LibraryCheckRunner(prisma, grading);
  const enqueued: string[] = [];
  // AI help's example checks run at once, as the judge's sample lane would,
  // and say so on a stand-in for BullMQ's queue events.
  const helpChecks = new AiHelpCheckRunner(prisma, grading, new ExecutionCapacity(2));
  const sampleEvents = Object.assign(new EventEmitter(), { waitUntilReady: async () => undefined });
  const helpEnqueued: string[] = [];
  const queue = {
    enqueueLibraryCheck: async (id: string) => { enqueued.push(id); },
    redispatchLibraryCheck: async (id: string) => { enqueued.push(id); },
    enqueueAiHelpCheck: async (id: string) => {
      helpEnqueued.push(id);
      await helpChecks.run(id);
      sampleEvents.emit("completed", { jobId: id });
    },
    sampleEvents,
    consumeSubmissionToken: async () => true,
  } as unknown as JudgeQueue;

  return {
    prisma, config, ids, auth, identity, engine, numbers, grading, checks, queue, enqueued, helpEnqueued, createExercise,
    /** Runs every dispatched check, as the judge's background worker would. */
    runChecks: async () => { for (const id of enqueued.splice(0)) await checks.run(id); },
    // Its academy's AI goes off when the spec ends: problems are learned even
    // when hidden, so what a spec leaves behind must not be learned by the next
    // process on this database (the browser test runs after these specs).
    close: async () => {
      await prisma.academyFeatureFlag.updateMany({ where: { academyId: ids.academy, feature: "AI_ASSISTANT" }, data: { isEnabled: false } }).catch(() => undefined);
      await prisma.$disconnect();
      await turn?.end();
    },
  };
}
export type AiFixture = Awaited<ReturnType<typeof createAiFixture>>;
