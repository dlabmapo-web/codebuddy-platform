import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import type { ExecutionEngine, ExecutionRequest, ExecutionResult } from "../judge/execution-engine.js";
import { GradingService } from "../judge/grading.service.js";
import { RuntimeRecovery } from "../judge/runtime-recovery.js";
import { JudgeQueue, type SolutionCheckJob } from "../judge/judge.queue.js";
import { SolutionCheckRunner } from "../judge/solution-check.runner.js";
import type { PointAwardService } from "../points/point-award.service.js";
import { CourseService } from "./course.service.js";
import { SolutionCheckService } from "./solution-check.service.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.COVE_INTEGRATION_REDIS_URL;

/** Real CPython, compiling learner code as `main.py` exactly as both graders do. */
const localPython: ExecutionEngine = {
  version: "pyodide-0.27.5",
  async run(request: ExecutionRequest): Promise<ExecutionResult> {
    const started = performance.now();
    const child = spawn("python3", ["-c", "import sys; exec(compile(sys.argv[1], 'main.py', 'exec'), {'__name__': '__main__'})", request.code]);
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.stdin.end(request.stdin);
    const code = await new Promise<number | null>(resolve => child.on("close", resolve));
    return { stdout, stderr, outcome: code === 0 ? "PASSED" : "RUNTIME_ERROR", runtimeMs: Math.round(performance.now() - started) };
  },
  async dispose() {},
};

/** The 탑 program a teacher submitted, which passes on Elice. */
const towerSolution = `from collections import deque
n = int(input())
heights = list(map(int, input().split()))
stack = deque()
stack.append((100_000_001, 0))
result = []
for i in range(n):
    x = heights[i]
    while True:
        top_height, top_index = stack[-1]
        if top_height >= x:
            break
        stack.pop()
    result.append(top_index)
    stack.append((x, i + 1))
for num in result:
    print(num, end=' ')
`;

const legacyCase = { comparator: "STDOUT" as const, weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null };
const legacyGrading = { mode: "LEGACY_STDIO" as const, inputPromptPolicy: "INCLUDE" as const, totalTimeLimitMs: null, comparatorTimeLimitMs: null, materialMaximumHundredths: null, materialScorePolicy: null };
const heights = Array.from({ length: 10_000 }, (_, index) => 1 + ((index * 7_919) % 99_999_989));
/** Case 8 as it was stored: N says 10,000, the text stops at exactly 50,000 characters. */
const cutInput = `10000\n${heights.join(" ")}\n`.slice(0, 50_000);

describe.skipIf(!databaseUrl)("official solution checks against PostgreSQL", () => {
  const createClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
  let client: ReturnType<typeof createClient>;
  let prisma: PrismaService;
  let access: AcademyAccessService;
  let checks: SolutionCheckService;
  let courses: CourseService;
  let statements = 0;
  const enqueued: Array<{ jobs: SolutionCheckJob[]; descriptor: unknown }> = [];
  const queue = { enqueueSolutionChecks: vi.fn(async (jobs: SolutionCheckJob[], descriptor: unknown) => { enqueued.push({ jobs: [...jobs], descriptor }); }) } as unknown as JudgeQueue;
  const config = { get: (key: string) => ({ PYODIDE_VERSION: "0.27.5", NATIVE_GRADING_ENABLED: false } as Record<string, unknown>)[key] } as unknown as ConfigService;
  const organizationId = randomUUID(), academyId = randomUUID(), userId = randomUUID(), authUserId = randomUUID(), courseId = randomUUID();
  const identity = { authUserId } as SupabaseIdentity;
  let lectureId: string;
  const counted = async <T>(action: () => Promise<T>) => { const before = statements; const value = await action(); return { value, statements: statements - before }; };
  const savedAt = async (materialId: string) => (await client.programmingExercise.findUniqueOrThrow({ where: { materialId } })).updatedAt.toISOString();
  const write = (overrides: Record<string, unknown> = {}) => ({
    academyId, courseId, lectureId, title: `Tower ${randomUUID().slice(0, 8)}`, difficulty: "HARD" as const,
    description: "<p>탑</p>", inputFormat: "", outputFormat: "", constraints: "", starterCode: "",
    solutions: [{ title: null, code: towerSolution }], aiFeedbackEnabled: false, isVisible: false,
    testCases: [
      { input: "5\n6 9 5 7 4\n", expectedOutput: "0 0 2 2 4", visibility: "SAMPLE" as const, ...legacyCase },
      { input: cutInput, expectedOutput: "0", visibility: "SAMPLE" as const, ...legacyCase },
    ],
    grading: legacyGrading, hints: [],
    ...overrides,
  });

  beforeAll(async () => {
    client = createClient();
    client.$on("query", () => { statements += 1; });
    prisma = client as unknown as PrismaService;
    access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    checks = new SolutionCheckService(prisma, access, config, queue);
    const revocation = { revokeClass: vi.fn(), revokeCourse: vi.fn() } as never;
    courses = new CourseService(prisma, access, new AuditService(), revocation, checks);
    await client.organization.create({ data: { id: organizationId, name: "Solution check fixture", slug: `check-${organizationId}` } });
    await client.academy.create({ data: { id: academyId, organizationId, name: "Fixture academy", slug: `check-${academyId}`, status: "ACTIVE" } });
    await client.user.create({ data: { id: userId, authUserId, status: "ACTIVE", email: `${userId}@fixture.invalid`, displayName: "Fixture manager" } });
    await client.academyMembership.create({ data: { academyId, userId, role: "MANAGER", status: "ACTIVE" } });
    await client.course.create({ data: { id: courseId, academyId, createdByUserId: userId, title: "Algorithms", isVisible: false } });
    const module = await client.courseModule.create({ data: { courseId, title: "Theory", externalKey: randomUUID(), position: 1, isVisible: true } });
    lectureId = (await client.lecture.create({ data: { courseModuleId: module.id, title: "deque2", externalKey: randomUUID(), position: 1, isVisible: true } })).id;
  });

  afterAll(async () => { await client?.$disconnect(); });

  it("queues a check when a problem is created, and only again when its grading or solutions change", async () => {
    enqueued.length = 0;
    const created = await courses.createExercise(identity, write());
    const materialId = created.material!.id;
    const first = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } });
    expect(first).toMatchObject({ status: "QUEUED", gradingRevision: 1, executionQueue: "cove-solution-checks", engineVersion: "0.27.5", executionRuntimeSnapshot: null });
    expect(enqueued).toEqual([{ jobs: [{ materialId, checkId: first.checkId, memoryLimitMb: 256 }], descriptor: null }]);

    // Statement text only: the last check still describes this problem.
    await courses.updateExercise(identity, { ...write({ title: created.material!.title, description: "<p>탑, reworded</p>" }), materialId, expectedUpdatedAt: await savedAt(materialId) });
    expect((await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } })).checkId).toBe(first.checkId);
    expect(enqueued).toHaveLength(1);

    // A new official solution is a new check, with the revision unchanged.
    const solutions = [{ title: null, code: towerSolution }, { title: "Second", code: "print(0)\n" }];
    await courses.updateExercise(identity, { ...write({ title: created.material!.title, solutions }), materialId, expectedUpdatedAt: await savedAt(materialId) });
    const second = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } });
    expect(second.checkId).not.toBe(first.checkId);
    expect(second.gradingRevision).toBe(1);

    // Changed test data moves the revision and queues again.
    await courses.updateExercise(identity, { ...write({ title: created.material!.title, solutions, testCases: write().testCases.slice(0, 1) }), materialId, expectedUpdatedAt: await savedAt(materialId) });
    const third = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } });
    expect(third).toMatchObject({ gradingRevision: 2, status: "QUEUED" });
    expect(third.checkId).not.toBe(second.checkId);
    expect(enqueued).toHaveLength(3);
  });

  it("settles problems that cannot be graded without queueing a job", async () => {
    enqueued.length = 0;
    const created = await courses.createExercise(identity, write({ solutions: [] }));
    const row = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId: created.material!.id } });
    expect(row).toMatchObject({ status: "NO_SOLUTION", executionQueue: null });
    expect(row.finishedAt).not.toBeNull();
    expect(enqueued).toHaveLength(0);
  });

  it("decides and writes any number of checks in two statements without native grading", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index++) ids.push((await courses.createExercise(identity, write())).material!.id);
    await client.exerciseSolutionCheck.deleteMany({ where: { materialId: { in: ids } } });
    const transaction = await counted(() => client.$transaction(async () => undefined));
    const { value, statements: used } = await counted(() => client.$transaction(tx => checks.prepare(tx, academyId, ids)));
    expect(value).toHaveLength(4);
    // The definitions read, and one upsert for all four.
    expect(used - transaction.statements).toBe(2);
    const again = await counted(() => client.$transaction(tx => checks.prepare(tx, academyId, ids)));
    expect(again.value).toHaveLength(0);
    expect(again.statements - transaction.statements).toBe(1);
  });

  it("runs the official solution through real Python and reports the cut case", async () => {
    enqueued.length = 0;
    const created = await courses.createExercise(identity, write());
    const materialId = created.material!.id;
    const job = enqueued[0]!.jobs[0]!;
    const grading = new GradingService(prisma, localPython, {} as PointAwardService, { version: "unused", compare: vi.fn() } as never);
    await new SolutionCheckRunner(prisma, grading).run(job);

    const check = await checks.get(identity, { academyId, courseId, materialId });
    expect(check).toMatchObject({ materialId, status: "FAILED", current: true, result: { version: 1, failureReason: null, solutions: [{
      index: 0, passed: false,
      cases: [
        { position: 1, outcome: "PASSED", error: null, cutSuspected: false, limitMs: 3000 },
        { position: 2, outcome: "RUNTIME_ERROR", error: { type: "IndexError", message: "list index out of range", line: 8 }, cutSuspected: true },
      ],
    }] } });
    expect(await checks.list(identity, { academyId, courseId })).toContainEqual({ materialId, status: "FAILED", failedPositions: [2] });
    // Nothing was recorded for any person.
    expect(await client.submission.count({ where: { materialId } })).toBe(0);
    expect(await client.staffPracticeAttempt.count({ where: { materialId } })).toBe(0);
  });

  it("reads one problem's check, and a whole course's, in one statement each", async () => {
    const created = await courses.createExercise(identity, write());
    const target = { academyId, courseId, materialId: created.material!.id };
    const permission = await counted(() => access.requirePermission(authUserId, academyId, "exercises.manage"));
    const one = await counted(() => checks.get(identity, target));
    expect(one.value?.status).toBe("QUEUED");
    expect(one.statements).toBe(permission.statements + 1);
    const course = await counted(() => checks.list(identity, { academyId, courseId }));
    expect(course.value.length).toBeGreaterThan(3);
    expect(course.statements).toBe(permission.statements + 1);
  });

  it("refuses a problem from another course", async () => {
    const created = await courses.createExercise(identity, write());
    await expect(checks.run(identity, { academyId, courseId: randomUUID(), materialId: created.material!.id })).rejects.toMatchObject({ code: "EXERCISE_NOT_FOUND" });
    expect(await checks.get(identity, { academyId, courseId: randomUUID(), materialId: created.material!.id })).toBeNull();
  });

  it.skipIf(!redisUrl)("dispatches through BullMQ to a worker that settles the check", async () => {
    const realQueue = new JudgeQueue(redisUrl!);
    const dispatched = new SolutionCheckService(prisma, access, config, realQueue);
    const service = new CourseService(prisma, access, new AuditService(), { revokeClass: vi.fn(), revokeCourse: vi.fn() } as never, dispatched);
    const grading = new GradingService(prisma, localPython, {} as PointAwardService, { version: "unused", compare: vi.fn() } as never);
    const worker = realQueue.createSolutionCheckWorker(job => new SolutionCheckRunner(prisma, grading).run(job), 1);
    try {
      const created = await service.createExercise(identity, write({ testCases: write().testCases.slice(0, 1) }));
      const materialId = created.material!.id;
      let settled = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } });
      for (let waited = 0; ["QUEUED", "RUNNING"].includes(settled.status) && waited < 20_000; waited += 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        settled = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId } });
      }
      expect(settled.status).toBe("PASSED");
      expect(settled.startedAt).not.toBeNull();
      expect(await realQueue.solutionCheckQueue.getJob(settled.checkId)).toBeTruthy();
    } finally {
      await worker.close();
      await realQueue.close();
    }
  });

  it.skipIf(!redisUrl)("recovers a lost dispatch and settles a check whose worker vanished", async () => {
    const realQueue = new JudgeQueue(redisUrl!);
    try {
      const lost = (await courses.createExercise(identity, write())).material!.id;
      const stuck = (await courses.createExercise(identity, write())).material!.id;
      const long = new Date(Date.now() - 120_000);
      await client.exerciseSolutionCheck.update({ where: { materialId: lost }, data: { queuedAt: long } });
      await client.exerciseSolutionCheck.update({ where: { materialId: stuck }, data: { queuedAt: long, status: "RUNNING", startedAt: long } });
      const lostCheck = await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId: lost } });
      await realQueue.solutionCheckQueue.remove(lostCheck.checkId).catch(() => undefined);

      await new RuntimeRecovery(prisma, realQueue).sweep();

      expect((await realQueue.solutionCheckQueue.getJob(lostCheck.checkId))?.data).toEqual({ materialId: lost, checkId: lostCheck.checkId, memoryLimitMb: 256 });
      expect(await client.exerciseSolutionCheck.findUniqueOrThrow({ where: { materialId: stuck } })).toMatchObject({
        status: "ERRORED", result: { version: 1, solutions: [], failureReason: "WORKER_LOST" },
      });
    } finally {
      await realQueue.solutionCheckQueue.obliterate({ force: true }).catch(() => undefined);
      await realQueue.close();
    }
  });
});
