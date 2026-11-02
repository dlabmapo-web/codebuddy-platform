import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ConfigService } from "@nestjs/config";
import { NativeExecutionClient, NativeExecutionService, nativeRuntimeVersion } from "@cove/grading-runtime";
import { defaultEliceGradingProfile, isTerminalStatus, type NativeReleaseManifest } from "@cove/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../database/prisma.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { SubmissionService } from "../learn/submission.service.js";
import { StaffPracticeService } from "../learn/staff-practice.service.js";
import { SampleCheckService } from "../learn/sample-check.service.js";
import { SubmissionController } from "../learn/submission.controller.js";
import { PracticeSubmissionController } from "../learn/practice-submission.controller.js";
import { RegradeService } from "../platform/regrade.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PointAwardService } from "../points/point-award.service.js";
import { JudgeQueue, runtimeQueueName } from "./judge.queue.js";
import { bootstrapNativeWorker } from "./native-worker.js";
import { actualComparatorIdentity } from "./comparator-identity.js";
import { nativeReadinessKey } from "./native-admission.js";
import { RuntimeRecovery } from "./runtime-recovery.js";
import { ComparatorPool } from "./comparator-pool.js";
import { GradingService } from "./grading.service.js";
import { gradingSnapshotFor } from "./grading-profile.js";
import { RegradeRunner } from "./regrade.runner.js";
import { SampleCheckStore } from "./sample-check.store.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.COVE_INTEGRATION_REDIS_URL;
function guard(value: string, protocol: string, database?: string) {
  const url = new URL(value);
  if (!process.env.COVE_NATIVE_FIXTURE_ID || process.env.DOTENV_CONFIG_PATH !== "/dev/null" || url.hostname !== "127.0.0.1" || url.protocol !== protocol || (database && url.pathname !== `/${database}`)) throw new Error("Explicit isolated loopback fixture required");
  return value;
}
/** Real authorization/Postgres/Redis/BullMQ/Unix framing and comparator; deterministic backend, NOT NsJail qualification. */
describe.skipIf(!databaseUrl || !redisUrl)("native application launcher-contract fixtures", { timeout: 30_000 }, () => {
  let db: PrismaService, queue: JudgeQueue, service: NativeExecutionService, worker: Awaited<ReturnType<typeof bootstrapNativeWorker>> | undefined;
  let config: ConfigService, submissions: SubmissionService, practice: StaffPracticeService, samples: SampleCheckService;
  let comparator: ComparatorPool, grading: GradingService, manifest: NativeReleaseManifest, directory: string, manifestPath: string, socketPath: string;
  const ids = { org: randomUUID(), academy: randomUUID(), manager: randomUUID(), student: randomUUID(), other: randomUUID(), course: randomUUID(), module: randomUUID(), lecture: randomUUID(), material: randomUUID(), class1: randomUUID(), class2: randomUUID() };
  const authIds = { manager: randomUUID(), student: randomUUID(), other: randomUUID() };
  const identity = (who: keyof typeof authIds) => ({ authUserId: authIds[who], email: `${who}@fixture.invalid` }) as SupabaseIdentity;
  let calls = 0, blocked: (() => Promise<void>) | undefined;
  const settings: Record<string, unknown> = {};
  const boot = () => bootstrapNativeWorker({ JUDGE_RUNTIME_FAMILY: "native", NATIVE_GRADING_MANIFEST: manifestPath, NATIVE_GRADING_SOCKET: socketPath,
    DATABASE_URL: databaseUrl, REDIS_URL: redisUrl, DATABASE_POOL_MAX: 3, DATABASE_CONNECTION_BUDGET: 20,
    DATABASE_API_POOL_BUDGET: 6, DATABASE_OPERATIONAL_RESERVE: 2, JUDGE_FLEET_WORKER_COUNT: 2 });
  const input = (code = "fixture:correct", who: "student" | "other" = "student") => ({ academyId: ids.academy, materialId: ids.material, classId: who === "student" ? ids.class1 : ids.class2, code });
  const submit = (code = "fixture:correct", who: "student" | "other" = "student") => submissions.submit(identity(who), input(code, who));
  async function until<T>(read: () => Promise<T>, check: (value: T) => boolean, timeout = 15_000): Promise<T> {
    const end = Date.now() + timeout;
    while (true) { const value = await read(); if (check(value)) return value; if (Date.now() > end) throw new Error(`Fixture deadline: ${JSON.stringify(value)}`); await delay(25); }
  }
  const result = (id: string, who: "student" | "other" = "student") => submissions.get(identity(who), { academyId: ids.academy, submissionId: id });
  const terminal = (id: string, who: "student" | "other" = "student") => until(() => result(id, who), value => isTerminalStatus(value.status));
  async function rawAttempt(code: string, overrides: Record<string, unknown> = {}) {
    const exercise = await db.programmingExercise.findUniqueOrThrow({ where: { materialId: ids.material }, include: { testCases: true } });
    const snapshot = gradingSnapshotFor(exercise, { engineVersion: "0.27.5", descriptor: manifest.descriptor });
    return db.submission.create({ data: { userId: ids.student, materialId: ids.material, sourceMaterialId: ids.material, courseId: ids.course,
      classId: ids.class1, gradingRevision: exercise.gradingRevision, language: "PYTHON", timeLimitMs: 1000, memoryLimitMb: 128, code, totalCount: 2,
      ...snapshot.submission, executionQueue: runtimeQueueName("official", manifest.descriptor), engineVersion: nativeRuntimeVersion(manifest.descriptor),
      problemTitle: "Fixture", courseTitle: "Fixture", moduleTitle: "Fixture", lectureTitle: "Fixture", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
      gradingCases: { create: snapshot.cases }, ...overrides } as never });
  }
  async function startService() {
    service = new NativeExecutionService({ socketPath, manifest, backend: { prepare: async () => undefined, execute: async request => {
      calls++; await blocked?.();
      if (request.code === "fixture:infra") throw new Error("deterministic fixture launcher fault");
      return { stdout: request.code === "fixture:wrong" && request.stdin === "hidden" ? "wrong" : "ok\n", stderr: "", outcome: "PASSED", runtimeMs: 1 };
    } } });
    await service.listen();
  }
  beforeAll(async () => {
    db = new PrismaService(new ConfigService({ DATABASE_URL: guard(databaseUrl!, "postgresql:", "cove_native_test"), DATABASE_POOL_MAX: 6 }) as never);
    queue = new JudgeQueue(guard(redisUrl!, "redis:"));
    directory = await mkdtemp(join(tmpdir(), "cove-native-app-")); socketPath = join(directory, "launcher.sock"); manifestPath = join(directory, "manifest.json");
    const digest = `sha256:${"1".repeat(64)}`;
    manifest = { schemaVersion: 1, descriptor: { schemaVersion: 1, engine: "native-cpython", pythonVersion: "3.12.12", architecture: "arm64",
      rootfsDigest: digest, packageManifestDigest: digest, nsjailRevision: "d8415bc8eea43cdd413daba25af63127019a1189", nsjailBinaryDigest: digest,
      sandboxPolicyVersion: "nsjail-cpython-v1", sandboxPolicyDigest: digest, guestBootstrapDigest: digest,
      comparator: await actualComparatorIdentity() as NativeReleaseManifest["descriptor"]["comparator"] },
      resources: { physicalMemoryMb: 4096, envelopeMemoryMb: 2048, serviceOverheadMb: 256, caseOverheadMb: 128, cpuSlots: 2,
        officialReservedSlots: 1, officialReservedMemoryMb: 768, maxCaseMemoryMb: 512, maxCasePids: 8, scratchMb: 16 },
      eligibility: [1, 2].flatMap(gradingRevision => ["live", "preview"].map(context => ({ organizationId: ids.org, academyId: ids.academy,
        materialId: ids.material, gradingRevision, context: context as "live" | "preview", kinds: ["official", "staff-practice", "sample", "regrade"] as const as unknown as Array<"official" | "staff-practice" | "sample" | "regrade">,
        memoryLimitMb: 128, timeLimitMs: 1000 }))) };
    await writeFile(manifestPath, JSON.stringify(manifest));
    await startService();
    await db.organization.create({ data: { id: ids.org, name: "Isolated fixture", slug: `nf-${ids.org}` } });
    await db.academy.create({ data: { id: ids.academy, organizationId: ids.org, name: "Fixture", slug: `nf-${ids.academy}`, status: "ACTIVE" } });
    for (const who of ["manager", "student", "other"] as const) {
      await db.user.create({ data: { id: ids[who], authUserId: authIds[who], username: `f${ids[who].slice(0, 7)}`, status: "ACTIVE" } });
      await db.academyMembership.create({ data: { academyId: ids.academy, userId: ids[who], role: who === "manager" ? "MANAGER" : "STUDENT", status: "ACTIVE" } });
    }
    await db.course.create({ data: { id: ids.course, academyId: ids.academy, createdByUserId: ids.manager, title: "Fixture", isVisible: true } });
    await db.courseModule.create({ data: { id: ids.module, courseId: ids.course, title: "Fixture", externalKey: "fixture", position: 1, isVisible: true } });
    await db.lecture.create({ data: { id: ids.lecture, courseModuleId: ids.module, title: "Fixture", externalKey: "fixture", position: 1, isVisible: true } });
    await db.material.create({ data: { id: ids.material, lectureId: ids.lecture, type: "PROGRAMMING_EXERCISE", title: "Fixture", position: 1, isVisible: true,
      programmingExercise: { create: { externalKey: randomUUID(), difficulty: "EASY", starterCode: "", memoryLimitMb: 128, timeLimitMs: 1000,
        gradingMode: "ELICE_STDIO", gradingSemanticVersion: "elice-v1", continuationPolicy: "CONTINUE_WITHIN_BUDGET", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
        totalTimeLimitMs: 60000, comparatorTimeLimitMs: 100, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL",
        testCases: { create: [{ position: 1, input: "sample", expectedOutput: "ok", visibility: "SAMPLE", weight: 30 },
          { position: 2, input: "hidden", expectedOutput: "(?P<word>ok)", comparator: "STDOUT_REGEX", visibility: "HIDDEN", weight: 70 }] } } } } });
    for (const [classId, who] of [[ids.class1, "student"], [ids.class2, "other"]] as const) {
      await db.class.create({ data: { id: classId, academyId: ids.academy, name: who, createdByUserId: ids.manager } });
      await db.classCourse.create({ data: { classId, courseId: ids.course, assignedByUserId: ids.manager } });
      const membership = await db.academyMembership.findFirstOrThrow({ where: { academyId: ids.academy, userId: ids[who] } });
      await db.classEnrollment.create({ data: { classId, membershipId: membership.id, enrolledByUserId: ids.manager } });
    }
    await db.academyFeatureFlag.createMany({ data: ["STUDENT_POINTS", "SERVER_SAMPLE_CHECKS"].map(feature => ({ academyId: ids.academy, feature: feature as "STUDENT_POINTS" | "SERVER_SAMPLE_CHECKS", isEnabled: true })) });
    Object.assign(settings, { NATIVE_GRADING_ENABLED: false, NATIVE_GRADING_BRIDGE_ACK: "filtered-compatibility-workers-v1", NATIVE_GRADING_MANIFEST: manifestPath,
      PYODIDE_VERSION: "0.27.5", SUBMISSION_RATE_LIMIT: 100, SAMPLE_CHECK_PER_MINUTE: 60, SAMPLE_CHECK_ACADEMY_OUTSTANDING: 50, REDIS_URL: redisUrl });
    config = new ConfigService(settings);
    const access = new AcademyAccessService(db, new SupportGrantResolver(db));
    submissions = new SubmissionService(db, access, config as never, new LearningClassContextService(db), queue);
    practice = new StaffPracticeService(db, access, config, queue);
    samples = new SampleCheckService(db, access, config as never, new LearningClassContextService(db), queue);
    comparator = new ComparatorPool(1); await comparator.warmUp();
    grading = new GradingService(db, new NativeExecutionClient({ socketPath, descriptor: manifest.descriptor, lane: "official" }), new PointAwardService(db), comparator);
  }, 60_000);
  afterAll(async () => { blocked = undefined; await worker?.close(); await comparator?.dispose(); await service?.close(); await queue?.close(); await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

  it("keeps historical/null work on exact compatibility queues", async () => {
    const accepted = await submit();
    const row = await db.submission.findUniqueOrThrow({ where: { id: accepted.submissionId } });
    expect(row.executionRuntimeSnapshot).toBeNull(); expect(row.executionQueue).toBeNull();
    expect(await queue.queue.getJob(row.id)).toBeTruthy();
    expect(runtimeQueueName("official")).toBe("cove-grading");
    const compat = grading.withEngine({ version: "pyodide-0.27.5", run: async () => ({ stdout: "wrong", stderr: "", outcome: "PASSED", runtimeMs: 1 }), dispose: async () => undefined });
    await compat.grade(row.id, async () => undefined); expect((await terminal(row.id)).status).toBe("FAILED");
  });
  it("runs native first/repeat solves, weighted hidden cases and class attribution after default flips", async () => {
    worker = await boot(); settings.NATIVE_GRADING_ENABLED = true;
    const first = await submit("fixture:wrong", "other"); const partial = await terminal(first.submissionId, "other");
    expect(partial.score).toBe(30); expect(partial.cases[1]).toMatchObject({ input: null, expectedOutput: null, actualOutput: null });
    const accepted = await submit(); settings.NATIVE_GRADING_ENABLED = false;
    expect((await terminal(accepted.submissionId)).status).toBe("PASSED");
    const stored = await db.submission.findUniqueOrThrow({ where: { id: accepted.submissionId } });
    expect(stored.executionQueue).toMatch(/^cove-grading-native-v1-[a-f0-9]{64}$/);
    expect(stored.executionRuntimeSnapshot).toEqual(manifest.descriptor);
    settings.NATIVE_GRADING_ENABLED = true;
    const repeat = await submit(); await terminal(repeat.submissionId);
    expect(await db.pointAward.count({ where: { membership: { userId: ids.student }, materialId: ids.material, reason: "EXERCISE_SOLVED" } })).toBe(1);
    expect((await db.pointAward.findFirstOrThrow({ where: { membership: { userId: ids.student }, reason: "EXERCISE_SOLVED" } })).classId).toBe(ids.class1);
    expect((await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } })).attemptCount).toBe(3);
    await expect(submissions.submit(identity("student"), { ...input(), classId: ids.class2 })).rejects.toThrow();
    await expect(result(accepted.submissionId, "other")).rejects.toThrow();
  });
  it("delivers committed terminal state to buffered and reconnecting authorized SSE without enqueuing", async () => {
    const accepted = await submit(); await terminal(accepted.submissionId);
    const enqueue = vi.spyOn(queue, "enqueue");
    const controller = new SubmissionController(submissions, db, { verifyAccessToken: async () => identity("student") } as never, queue);
    for (let n = 0; n < 2; n++) {
      const stream = await controller.stream(accepted.submissionId, ids.academy, "Bearer fixture");
      await delay(20);
      const events: Array<{ type: string; data: string }> = [];
      const subscription = stream.subscribe(event => events.push(event));
      await until(async () => events, v => v.some(e => e.type === "result" && JSON.parse(e.data).status === "PASSED"));
      subscription.unsubscribe(); expect(JSON.stringify(events)).not.toContain("hidden");
    }
    expect(enqueue).not.toHaveBeenCalled(); enqueue.mockRestore();
  });
  it("executes idempotent staff practice and ephemeral public samples on their native queues", async () => {
    const studentRows = await db.submission.count(); const points = await db.pointAward.count();
    const request = { academyId: ids.academy, materialId: ids.material, code: "fixture:correct", requestId: randomUUID() };
    const accepted = await practice.submit(identity("manager"), request);
    const duplicate = await practice.submit(identity("manager"), request); expect(duplicate.submissionId).toBe(accepted.submissionId);
    await until(() => practice.get(identity("manager"), { academyId: ids.academy, submissionId: accepted.submissionId }), value => isTerminalStatus(value.status));
    const stored = await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: accepted.submissionId } }); expect(stored.executionQueue).toBe(runtimeQueueName("practice", manifest.descriptor));
    const preview = await practice.submit(identity("manager"), { ...request, requestId: randomUUID(), preview: true, gradingRevision: 1 });
    await until(() => practice.get(identity("manager"), { academyId: ids.academy, submissionId: preview.submissionId }), v => isTerminalStatus(v.status));
    expect((await db.staffPracticeAttempt.findUniqueOrThrow({ where: { id: preview.submissionId } })).executionQueue).toBe(runtimeQueueName("practice", manifest.descriptor));
    const controller = new PracticeSubmissionController(practice, { verifyAccessToken: async () => identity("manager") } as never, queue);
    const stream = await controller.stream(accepted.submissionId, ids.academy, "Bearer fixture");
    const events: Array<{ type: string; data: string }> = []; const sub = stream.subscribe(e => events.push(e));
    await until(async () => events, e => e.some(x => x.type === "result" && JSON.parse(x.data).status === "PASSED")); sub.unsubscribe();
    const checkInput = { ...input(), position: 1, workspaceRevision: 1, clientRequestId: randomUUID() };
    const check = await samples.start(identity("student"), checkInput);
    expect((await samples.start(identity("student"), checkInput)).checkId).toBe(check.checkId);
    const checked = await until(() => samples.get(identity("student"), { academyId: ids.academy, checkId: check.checkId }), v => v.status === "COMPLETED");
    expect(checked.result?.outcome).toBe("PASSED");
    expect((await new SampleCheckStore(() => queue.redis()).get(check.checkId))?.snapshot.executionRuntimeSnapshot).toEqual(manifest.descriptor);
    expect(await db.submission.count()).toBe(studentRows); expect(await db.pointAward.count()).toBe(points);
  });
  it("recovers durable native dispatch after stopped workers/lost enqueue acknowledgement and excludes older releases", async () => {
    // Staff snapshot/dispatch intent survives an acknowledged enqueue loss too.
    const drop = vi.spyOn(queue, "enqueuePractice").mockResolvedValueOnce(undefined);
    const staff = await practice.submit(identity("manager"), { academyId: ids.academy, materialId: ids.material, code: "fixture:correct", requestId: randomUUID() });
    drop.mockRestore();
    await db.staffPracticeAttempt.update({ where: { id: staff.submissionId }, data: { createdAt: new Date(Date.now() - 40_000) } });
    await worker!.close(); worker = undefined;
    const row = await rawAttempt("fixture:correct", { createdAt: new Date(Date.now() - 40_000) });
    const legacyRecovery = new RuntimeRecovery(db, queue); await legacyRecovery.sweep(); expect(await queue.queue.getJob(row.id)).toBeFalsy();
    const old = { ...manifest.descriptor, rootfsDigest: `sha256:${"2".repeat(64)}` };
    const oldQueue = new JudgeQueue(redisUrl!, old); await new RuntimeRecovery(db, oldQueue).sweep(); expect(await oldQueue.queue.getJob(row.id)).toBeFalsy(); await oldQueue.close();
    const nativeQueue = queue.forRuntime(manifest.descriptor); await new RuntimeRecovery(db, nativeQueue).sweep(); expect(await nativeQueue.queue.getJob(row.id)).toBeTruthy();
    settings.NATIVE_GRADING_ENABLED = false; worker = await boot(); expect((await terminal(row.id)).status).toBe("PASSED");
    await until(() => practice.get(identity("manager"), { academyId: ids.academy, submissionId: staff.submissionId }), v => isTerminalStatus(v.status));
    settings.NATIVE_GRADING_ENABLED = true;
  });
  it("rejects descriptor mismatch and launcher faults as infrastructure without points/progress", async () => {
    const progress = await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } });
    const descriptor = { ...manifest.descriptor, guestBootstrapDigest: `sha256:${"3".repeat(64)}` };
    const row = await rawAttempt("fixture:correct", { executionRuntimeSnapshot: descriptor });
    const before = calls; await grading.grade(row.id, async () => undefined); expect((await result(row.id)).failureReason).toBe("RUNTIME_VERSION_MISMATCH"); expect(calls).toBe(before);
    const infra = await submit("fixture:infra"); expect((await terminal(infra.submissionId)).status).toBe("ERRORED");
    expect((await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } })).attemptCount).toBe(progress.attemptCount);
    await worker!.close(); worker = undefined; await service.close(); await startService(); worker = await boot();
  });
  it("pauses local consumers on launcher loss and leaves accepted work queued until health returns", async () => {
    await service.close();
    const redis = await queue.redis();
    await until(() => redis.zcard(nativeReadinessKey(manifest.descriptor, "official")), count => count === 0, 8_000);
    const row = await rawAttempt("fixture:correct"); const before = calls;
    await queue.enqueue(row.id, manifest.descriptor);
    await delay(100);
    expect((await db.submission.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("QUEUED"); expect(calls).toBe(before);
    await startService();
    expect((await terminal(row.id)).status).toBe("PASSED");
  });
  it("does not move progress when revision changes during execution", async () => {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); blocked = () => held;
    const accepted = await submit(); await until(() => result(accepted.submissionId), v => v.status === "RUNNING");
    const before = await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } });
    await db.programmingExercise.update({ where: { materialId: ids.material }, data: { gradingRevision: 2 } }); blocked = undefined; release();
    await expect(samples.start(identity("student"), { ...input(), position: 1, workspaceRevision: 1, clientRequestId: randomUUID() })).rejects.toMatchObject({ code: "SAMPLE_CHECK_STALE" });
    expect((await terminal(accepted.submissionId)).status).toBe("PASSED");
    expect(await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } })).toMatchObject({ attemptCount: before.attemptCount, gradingRevision: 1 });
  });
  it("dispatches retained native repairs on a legal BullMQ id and counts duplicate delivery once", async () => {
    const access = new AcademyAccessService(db, new SupportGrantResolver(db));
    const regrades = new RegradeService(db, new PlatformAccessService(db), access, new AuditService(), config as never);
    try {
      const plan = await regrades.planRegrade(identity("manager"), { academyId: ids.academy, materialId: ids.material }, { requestId: randomUUID() });
      await regrades.startRegrade(identity("manager"), { runId: plan.runId }, (job, descriptor) => queue.enqueueRegrade(job, descriptor));
      const repairs = await db.submission.findMany({ where: { regradeRunId: plan.runId } });
      expect(repairs.length).toBe(2);
      for (const repair of repairs) {
        expect(repair.executionQueue).toBe(runtimeQueueName("regrade", manifest.descriptor));
        expect(repair.executionRuntimeSnapshot).toEqual(manifest.descriptor);
        await until(() => db.submission.findUniqueOrThrow({ where: { id: repair.id } }), value => isTerminalStatus(value.status));
      }
      const runner = new RegradeRunner(db, grading);
      await Promise.all(repairs.map(repair => runner.run({ runId: plan.runId, submissionId: repair.id, requestId: null })));
      const settled = await until(() => db.platformOperationRun.findUniqueOrThrow({ where: { id: plan.runId } }), r => r.completedCount === 2);
      expect(settled.failedCount).toBe(0);
    } finally { await regrades.onModuleDestroy(); }

  });
  it("fences overlapping repair/official admission and commits duplicate delivery only once", async () => {
    const before = await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } });
    const repair = await rawAttempt("fixture:correct", { regradeRunId: (await db.platformOperationRun.findFirstOrThrow({ where: { academyId: ids.academy } })).id });
    await expect(rawAttempt("fixture:correct")).rejects.toMatchObject({ code: "P2002" });
    await Promise.all([grading.grade(repair.id, async () => undefined), grading.grade(repair.id, async () => undefined)]);
    expect(await db.submissionCase.count({ where: { submissionId: repair.id } })).toBe(2);
    const official = await rawAttempt("fixture:correct");
    await grading.grade(official.id, async () => undefined);
    const after = await db.studentExerciseProgress.findUniqueOrThrow({ where: { userId_materialId: { userId: ids.student, materialId: ids.material } } });
    expect(after.attemptCount).toBe(before.attemptCount + 1); expect(after.bestScore).toBe(100);
  });
  it("review regression: admits official and staff work with one connection under concurrent requests", async () => {
    if (!worker) worker = await boot();
    settings.NATIVE_GRADING_ENABLED = true;
    const limited = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: 1 }) as never);
    try {
      const access = new AcademyAccessService(limited, new SupportGrantResolver(limited));
      const official = new SubmissionService(limited, access, config as never, new LearningClassContextService(limited), queue);
      const personal = new StaffPracticeService(limited, access, config, queue);
      const first = await official.submit(identity("student"), input());
      expect((await limited.submission.findUniqueOrThrow({ where: { id: first.submissionId } })).executionRuntimeSnapshot).toEqual(manifest.descriptor);
      await terminal(first.submissionId);
      const [student, other, staff] = await Promise.all([
        official.submit(identity("student"), input()),
        official.submit(identity("other"), input("fixture:correct", "other")),
        personal.submit(identity("manager"), { academyId: ids.academy, materialId: ids.material, code: "fixture:correct", requestId: randomUUID() }),
      ]);
      await Promise.all([terminal(student.submissionId), terminal(other.submissionId, "other"),
        until(() => personal.get(identity("manager"), { academyId: ids.academy, submissionId: staff.submissionId }), value => isTerminalStatus(value.status))]);
      for (const id of [student.submissionId, other.submissionId]) expect((await limited.submission.findUniqueOrThrow({ where: { id } })).executionQueue).toBe(runtimeQueueName("official", manifest.descriptor));
      expect((await limited.staffPracticeAttempt.findUniqueOrThrow({ where: { id: staff.submissionId } })).executionQueue).toBe(runtimeQueueName("practice", manifest.descriptor));
    } finally { await limited.$disconnect(); }
  });

  it("review regression: persists all 101 native repairs during an owned Redis outage and recovers exactly once", async () => {
    if (!worker) worker = await boot();
    const materialId = randomUUID();
    await db.material.create({ data: { id: materialId, lectureId: ids.lecture, type: "PROGRAMMING_EXERCISE", title: "Repair outage fixture", position: 2, isVisible: true,
      programmingExercise: { create: { externalKey: randomUUID(), difficulty: "EASY", starterCode: "", memoryLimitMb: 128, timeLimitMs: 1000, gradingRevision: 2,
        gradingMode: "ELICE_STDIO", gradingSemanticVersion: "elice-v1", continuationPolicy: "CONTINUE_WITHIN_BUDGET", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
        totalTimeLimitMs: 60000, comparatorTimeLimitMs: 100, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL",
        testCases: { create: [{ position: 1, input: "sample", expectedOutput: "ok", visibility: "SAMPLE", weight: 30 },
          { position: 2, input: "hidden", expectedOutput: "(?P<word>ok)", comparator: "STDOUT_REGEX", visibility: "HIDDEN", weight: 70 }] } } } } });
    manifest.eligibility.push({ ...manifest.eligibility[0]!, materialId, gradingRevision: 2 });
    await writeFile(manifestPath, JSON.stringify(manifest));
    const people = Array.from({ length: 101 }, () => ({ id: randomUUID(), membershipId: randomUUID() }));
    await db.user.createMany({ data: people.map(({ id }) => ({ id, username: `r${id.replaceAll("-", "").slice(0, 12)}`, status: "ACTIVE" })) });
    await db.academyMembership.createMany({ data: people.map(({ id, membershipId }) => ({ id: membershipId, academyId: ids.academy, userId: id, role: "STUDENT", status: "ACTIVE" })) });
    await db.classEnrollment.createMany({ data: people.map(({ membershipId }) => ({ classId: ids.class1, membershipId, enrolledByUserId: ids.manager })) });
    const exercise = await db.programmingExercise.findUniqueOrThrow({ where: { materialId }, include: { testCases: true } });
    const frozen = gradingSnapshotFor(exercise, { engineVersion: "0.27.5", descriptor: manifest.descriptor });
    await db.submission.createMany({ data: people.map(({ id }) => ({ userId: id, materialId, sourceMaterialId: materialId, courseId: ids.course, classId: ids.class1,
      gradingRevision: 1, language: "PYTHON", timeLimitMs: 1000, memoryLimitMb: 128, code: "fixture:correct", totalCount: 2, passedCount: 2, score: 100, status: "PASSED", gradedAt: new Date(),
      ...frozen.submission, executionQueue: runtimeQueueName("official", manifest.descriptor), engineVersion: nativeRuntimeVersion(manifest.descriptor),
      problemTitle: "Fixture", courseTitle: "Fixture", moduleTitle: "Fixture", lectureTitle: "Fixture", modulePosition: 1, lecturePosition: 1, problemPosition: 2 })) as never });
    const limited = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: 1 }) as never);
    const access = new AcademyAccessService(limited, new SupportGrantResolver(limited));
    const regrades = new RegradeService(limited, new PlatformAccessService(limited), access, new AuditService(), config as never);
    const endpoint = process.env.COVE_NATIVE_TEST_DOCKER_ENDPOINT;
    const container = process.env.COVE_NATIVE_TEST_REDIS_CONTAINER;
    const fixtureId = process.env.COVE_NATIVE_FIXTURE_ID;
    if (!endpoint?.startsWith("unix:///") || !fixtureId || container !== `cove-native-app-redis-${fixtureId}`) throw new Error("Owned local fixture Redis required");
    const docker = (args: string[]) => promisify(execFile)("docker", ["--host", endpoint, ...args]);
    expect((await docker(["inspect", "-f", '{{index .Config.Labels "cove.native.task2"}}', container])).stdout.trim()).toBe(fixtureId);
    let paused = false;
    try {
      const plan = await regrades.planRegrade(identity("manager"), { academyId: ids.academy, materialId }, { requestId: randomUUID() });
      expect(plan.plannedCount).toBe(101);
      await docker(["pause", container]); paused = true;
      const dispatch = vi.fn((job, descriptor) => queue.enqueueRegrade(job, descriptor));
      // No Redis responses are possible here, including readiness. The complete DB intent must still commit.
      await regrades.startRegrade(identity("manager"), { runId: plan.runId }, dispatch);
      const pending = await limited.submission.findMany({ where: { regradeRunId: plan.runId } });
      expect(pending.length).toBe(101); expect(new Set(pending.map(row => row.userId)).size).toBe(101);
      expect(pending.every(row => row.status === "QUEUED" && row.executionQueue === runtimeQueueName("regrade", manifest.descriptor))).toBe(true);
      expect(await limited.platformOperationRun.findUniqueOrThrow({ where: { id: plan.runId } })).toMatchObject({ status: "RUNNING", plannedCount: 101, dispatchedCount: 101, completedCount: 0, failedCount: 0 });
      expect(dispatch).toHaveBeenCalledTimes(1);
      await docker(["unpause", container]); paused = false;
      await db.submission.updateMany({ where: { regradeRunId: plan.runId }, data: { createdAt: new Date(Date.now() - 40_000) } });
      const recovery = new RuntimeRecovery(db, queue.forRuntime(manifest.descriptor));
      const settled = await until(async () => { await recovery.sweep(); return db.platformOperationRun.findUniqueOrThrow({ where: { id: plan.runId } }); }, run => run.status === "COMPLETED", 60_000);
      expect(settled).toMatchObject({ plannedCount: 101, dispatchedCount: 101, completedCount: 101, failedCount: 0 });
      await new RegradeRunner(db, grading).run({ runId: plan.runId, submissionId: pending[0]!.id, requestId: null });
      await recovery.sweep();
      expect((await db.platformOperationRun.findUniqueOrThrow({ where: { id: plan.runId } })).completedCount).toBe(101);
      expect(await db.submission.count({ where: { regradeRunId: plan.runId } })).toBe(101);
      expect(await db.pointAward.count({ where: { materialId, reason: "EXERCISE_SOLVED" } })).toBe(101);
      expect(await db.studentExerciseProgress.count({ where: { materialId, status: "SOLVED", attemptCount: 0 } })).toBe(101);
    } finally {
      if (paused) await docker(["unpause", container]);
      await regrades.onModuleDestroy(); await limited.$disconnect();
    }
  }, 90_000);

});
