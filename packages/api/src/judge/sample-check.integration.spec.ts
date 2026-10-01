import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import {
  createProgrammingExerciseSchema,
  defaultEliceGradingProfile,
  updateProgrammingExerciseSchema,
  type SampleCheckView,
} from "@cove/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { SampleCheckService } from "../learn/sample-check.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { ComparatorPool } from "./comparator-pool.js";
import { ExecutionCapacity } from "./execution-capacity.js";
import { JudgeQueue } from "./judge.queue.js";
import { PyodideExecutionEngine } from "./pyodide-engine.js";
import { SampleCheckRunner, SAMPLE_QUEUE_WAIT_MS } from "./sample-check.runner.js";
import { SampleCheckStore } from "./sample-check.store.js";

/**
 * Public sample checks, end to end: a Manager-authored problem with two public
 * and three hidden cases, real students, a real PostgreSQL with every
 * migration, a real Redis, a real runner per case and the real comparator.
 *
 * The worker is invoked directly for each check, as the judge's sample worker
 * would. Opt-in, because it needs a disposable database and Redis:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… \
 *   COVE_INTEGRATION_REDIS_URL=redis://… \
 *   npx vitest run src/judge/sample-check.integration.spec.ts
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.COVE_INTEGRATION_REDIS_URL;
const SENTINEL = "HIDDEN_SENTINEL";

describe.skipIf(!databaseUrl || !redisUrl)("public sample checks, end to end", () => {
  let prisma: PrismaService;
  let courses: CourseService;
  let checks: SampleCheckService;
  let runner: SampleCheckRunner;
  let queue: JudgeQueue;
  let engine: PyodideExecutionEngine;
  let comparator: ComparatorPool;
  const responses: SampleCheckView[] = [];

  const ids = {
    organization: randomUUID(),
    academy: randomUUID(),
    manager: randomUUID(),
    student: randomUUID(),
    other: randomUUID(),
    studentMembership: randomUUID(),
    otherMembership: randomUUID(),
    klass: randomUUID(),
  };
  const auth = { manager: randomUUID(), student: randomUUID(), other: randomUUID() };
  const identity = (authUserId: string) =>
    ({ authUserId, email: `${authUserId}@it.test` }) as SupabaseIdentity;
  const manager = identity(auth.manager);
  const student = identity(auth.student);
  const other = identity(auth.other);
  let courseId = "";
  let lectureId = "";
  let materialId = "";
  let revision = 1;

  const answer = (
    input: string,
    expectedOutput: string,
    weight: number,
    visibility: "SAMPLE" | "HIDDEN",
    comparator: "STDOUT" | "STDOUT_REGEX" = "STDOUT",
  ) => ({
    input,
    expectedOutput,
    weight,
    visibility,
    comparator,
    timeLimitMsOverride: null,
    softTimeLimitMs: null,
    softPenalty: null,
    label: null,
  });
  /** Doubles its input. Two public cases, three hidden ones. */
  const cases = [
    answer("2\n", "4", 10, "SAMPLE"),
    answer("5\n", "^10$", 10, "SAMPLE", "STDOUT_REGEX"),
    answer(`7\n`, `14 ${SENTINEL}_A`, 20, "HIDDEN"),
    answer(`8\n`, `16 ${SENTINEL}_B`, 30, "HIDDEN"),
    answer(`9\n`, `18 ${SENTINEL}_C`, 30, "HIDDEN"),
  ];
  const doubling = "print(int(input()) * 2)\n";

  const start = async (
    who: SupabaseIdentity,
    input: { position: number; code: string; clientRequestId?: string; workspaceRevision?: number },
  ) => {
    const view = await checks.start(who, {
      academyId: ids.academy,
      classId: ids.klass,
      materialId,
      position: input.position,
      code: input.code,
      workspaceRevision: input.workspaceRevision ?? revision,
      clientRequestId: input.clientRequestId ?? randomUUID(),
    });
    responses.push(view);
    return view;
  };
  const read = async (who: SupabaseIdentity, checkId: string) => {
    const view = await checks.get(who, { academyId: ids.academy, checkId });
    responses.push(view);
    return view;
  };
  /** Starts a check, runs it as the judge's worker would, and reads it back. */
  const check = async (position: number, code: string) => {
    const accepted = await start(student, { position, code });
    await runner.run(accepted.checkId);
    return read(student, accepted.checkId);
  };
  /** Official state belonging to this suite's students — and only theirs. */
  const officialCounts = () => {
    const userId = { in: [ids.student, ids.other] };
    return Promise.all([
      prisma.submission.count({ where: { userId } }),
      prisma.submissionCase.count({ where: { submission: { userId } } }),
      prisma.submissionGradingCase.count({ where: { submission: { userId } } }),
      prisma.studentExerciseProgress.count({ where: { userId } }),
      prisma.pointAward.count({
        where: { membershipId: { in: [ids.studentMembership, ids.otherMembership] } },
      }),
    ]);
  };

  beforeAll(async () => {
    const config = new ConfigService({
      DATABASE_URL: databaseUrl,
      PYODIDE_VERSION: "0.27.5",
      SAMPLE_CHECK_PER_MINUTE: 60,
      SAMPLE_CHECK_ACADEMY_OUTSTANDING: 50,
    });
    prisma = new PrismaService(config as never);
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    courses = new CourseService(prisma, access, new AuditService(), {
      revokeClass: async () => undefined,
    } as unknown as MonitoringRevocationService);
    queue = new JudgeQueue(redisUrl!);
    await (await queue.redis()).flushdb();
    checks = new SampleCheckService(
      prisma,
      access,
      config as never,
      new LearningClassContextService(prisma),
      queue,
    );
    engine = new PyodideExecutionEngine("0.27.5", 1, 1);
    comparator = new ComparatorPool(1);
    await Promise.all([engine.warmUp(), comparator.warmUp()]);
    runner = new SampleCheckRunner(
      new SampleCheckStore(() => queue.redis()),
      engine,
      comparator,
      new ExecutionCapacity(2),
    );

    await prisma.organization.create({
      data: { id: ids.organization, name: "IT Org", slug: `it-${ids.organization.slice(0, 8)}` },
    });
    await prisma.academy.create({
      data: { id: ids.academy, organizationId: ids.organization, name: "IT", slug: `it-${ids.academy.slice(0, 8)}`, status: "ACTIVE" },
    });
    for (const [id, authUserId, name] of [
      [ids.manager, auth.manager, "m"],
      [ids.student, auth.student, "s"],
      [ids.other, auth.other, "o"],
    ] as const) {
      await prisma.user.create({
        data: { id, authUserId, status: "ACTIVE", email: `${authUserId}@it.test`, username: `${name}${id.slice(0, 6)}` },
      });
    }
    await prisma.academyMembership.create({
      data: { academyId: ids.academy, userId: ids.manager, role: "MANAGER", status: "ACTIVE" },
    });
    for (const [membership, userId] of [
      [ids.studentMembership, ids.student],
      [ids.otherMembership, ids.other],
    ] as const) {
      await prisma.academyMembership.create({
        data: { id: membership, academyId: ids.academy, userId, role: "STUDENT", status: "ACTIVE" },
      });
    }
    await prisma.academyFeatureFlag.create({
      data: { academyId: ids.academy, feature: "SERVER_SAMPLE_CHECKS", isEnabled: true },
    });

    const course = await courses.create(manager, { academyId: ids.academy, title: "Track", description: "" });
    courseId = course.id;
    await courses.createModule(manager, { academyId: ids.academy, courseId, title: "M", description: "" });
    const courseModule = await prisma.courseModule.findFirstOrThrow({ where: { courseId } });
    await courses.createLecture(manager, {
      academyId: ids.academy,
      courseId,
      moduleId: courseModule.id,
      title: "L",
      description: "",
    });
    lectureId = (await prisma.lecture.findFirstOrThrow({ where: { courseModuleId: courseModule.id } })).id;

    const created = await courses.createExercise(
      manager,
      createProgrammingExerciseSchema.parse({
        academyId: ids.academy,
        courseId,
        lectureId,
        title: "Double",
        difficulty: "EASY",
        description: "<p>Print twice the input.</p>",
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        starterCode: "",
        solutionCode: doubling,
        aiFeedbackEnabled: false,
        isVisible: true,
        testCases: cases,
        grading: defaultEliceGradingProfile,
        hints: [],
      }),
    );
    materialId = created.material!.id;
    revision = created.material!.programmingExercise!.gradingRevision;
    await courses.setExerciseVisibility(manager, { academyId: ids.academy, courseId, lectureId, materialId, isVisible: true });
    await prisma.courseModule.updateMany({ where: { courseId }, data: { isVisible: true } });
    await prisma.lecture.updateMany({ where: { id: lectureId }, data: { isVisible: true } });
    await courses.setVisibility(manager, { academyId: ids.academy, courseId, isVisible: true });

    await prisma.class.create({
      data: { id: ids.klass, academyId: ids.academy, name: "Cohort", createdByUserId: ids.manager },
    });
    await prisma.classCourse.create({ data: { classId: ids.klass, courseId, assignedByUserId: ids.manager } });
    for (const membershipId of [ids.studentMembership, ids.otherMembership]) {
      await prisma.classEnrollment.create({
        data: { classId: ids.klass, membershipId, enrolledByUserId: ids.manager },
      });
    }
  }, 180_000);

  afterAll(async () => {
    await queue?.sampleQueue.obliterate({ force: true }).catch(() => undefined);
    await queue?.close();
    await engine?.dispose();
    await comparator?.dispose();
    await prisma?.$disconnect();
  });

  it("Test 1 runs only the first public case and passes it", async () => {
    const view = await check(1, doubling);

    expect(view).toEqual(
      expect.objectContaining({ status: "COMPLETED", position: 1, refreshRequired: false }),
    );
    expect(view.result).toEqual(
      expect.objectContaining({
        outcome: "PASSED",
        outputMatched: true,
        stdout: "4\n",
        rule: { comparator: "STDOUT", expected: "4" },
      }),
    );
  }, 60_000);

  it("Test 2 runs only the second, with its own Python regex rule", async () => {
    const view = await check(2, doubling);

    // Its own input (5), judged by re.search where `$` matches before the
    // final newline — the rule a JavaScript check would have got wrong.
    expect(view.result).toEqual(
      expect.objectContaining({
        outcome: "PASSED",
        stdout: "10\n",
        rule: { comparator: "STDOUT_REGEX", expected: "^10$" },
      }),
    );
  }, 60_000);

  it("shows a mismatch with the program's output and the public rule", async () => {
    const view = await check(1, "print(int(input()) + 2 + 1)\n");

    expect(view.result).toEqual(
      expect.objectContaining({ outcome: "WRONG_OUTPUT", outputMatched: false, stdout: "5\n" }),
    );
  }, 60_000);

  it("reports a crash as a runtime error, not a wrong answer", async () => {
    const view = await check(1, "raise ValueError('nope')\n");

    expect(view.result).toEqual(
      expect.objectContaining({ outcome: "RUNTIME_ERROR", outputMatched: null }),
    );
    expect(view.result!.stderr).toContain("ValueError");
  }, 60_000);

  it("refuses a hidden or nonexistent position without saying which", async () => {
    await expect(start(student, { position: 3, code: doubling })).rejects.toMatchObject({
      code: "SAMPLE_CHECK_NOT_FOUND",
    });
    await expect(start(student, { position: 99, code: doubling })).rejects.toMatchObject({
      code: "SAMPLE_CHECK_NOT_FOUND",
    });
  });

  it("asks for a refresh when the workspace is at an old revision", async () => {
    await expect(
      start(student, { position: 1, code: doubling, workspaceRevision: revision + 5 }),
    ).rejects.toMatchObject({ code: "SAMPLE_CHECK_STALE" });
  });

  it("starts one check for a double click, and refuses a reused request id with other code", async () => {
    const clientRequestId = randomUUID();
    const first = await start(student, { position: 1, code: doubling, clientRequestId });
    const again = await start(student, { position: 1, code: doubling, clientRequestId });
    expect(again.checkId).toBe(first.checkId);

    await expect(
      start(student, { position: 1, code: "print(0)\n", clientRequestId }),
    ).rejects.toMatchObject({ code: "SAMPLE_CHECK_CONFLICT" });

    // One outstanding check per student: a second click elsewhere waits.
    await expect(start(student, { position: 2, code: doubling })).rejects.toMatchObject({
      code: "SAMPLE_CHECK_BUSY",
    });

    const cancelled = await checks.cancel(student, { academyId: ids.academy, checkId: first.checkId });
    expect(cancelled.status).toBe("CANCELLED");
    // A cancelled check never runs, and its slot is free again.
    await runner.run(first.checkId);
    expect((await read(student, first.checkId)).status).toBe("CANCELLED");
    expect((await check(2, doubling)).status).toBe("COMPLETED");
  }, 60_000);

  it("gives another student nothing — not even that the check exists", async () => {
    const mine = await check(1, doubling);

    const theirs = await checks.get(other, { academyId: ids.academy, checkId: mine.checkId });
    expect(theirs).toEqual(expect.objectContaining({ status: "EXPIRED", result: null, position: null }));
    const cancelAttempt = await checks.cancel(other, { academyId: ids.academy, checkId: mine.checkId });
    expect(cancelAttempt.status).toBe("EXPIRED");
    expect((await read(student, mine.checkId)).status).toBe("COMPLETED");
  }, 60_000);

  it("writes nothing to official grading, progress or points", async () => {
    const before = await officialCounts();

    await check(1, doubling);
    await check(1, "print('wrong')\n");
    const cancelled = await start(student, { position: 2, code: doubling });
    await checks.cancel(student, { academyId: ids.academy, checkId: cancelled.checkId });

    expect(await officialCounts()).toEqual(before);
    expect(before).toEqual([0, 0, 0, 0, 0]);
  }, 60_000);

  it("ends a check left queued past its wait, without a worker touching it", async () => {
    // The reported issue: the ten-second wait was only checked when a worker
    // picked the job up, so with every slot busy a student watched "Queued"
    // indefinitely — and stayed blocked from starting another check.
    const accepted = await start(student, { position: 1, code: doubling });
    expect(accepted.status).toBe("QUEUED");

    // The wait, spent: the judge never got to this job.
    const client = await queue.redis();
    const key = `cove:sample-check:${accepted.checkId}`;
    const stored = JSON.parse((await client.get(key))!) as { acceptedAt: number };
    stored.acceptedAt = Date.now() - SAMPLE_QUEUE_WAIT_MS - 1_000;
    await client.set(key, JSON.stringify(stored), "KEEPTTL");

    const view = await read(student, accepted.checkId);

    expect(view).toEqual(expect.objectContaining({ status: "TIMED_OUT" }));
    // Its admission markers went with it, so the student is free at once.
    expect(await client.exists(`cove:sample-check:outstanding:user:${ids.student}`)).toBe(0);
    const next = await start(student, { position: 1, code: doubling });
    expect(next.status).toBe("QUEUED");
    await runner.run(next.checkId);
    expect((await read(student, next.checkId)).status).toBe("COMPLETED");
  }, 60_000);

  it("lets a worker that claims the job first keep it", async () => {
    const accepted = await start(student, { position: 1, code: doubling });
    // Queued too long, but the judge reaches it before anyone reads it.
    const client = await queue.redis();
    const key = `cove:sample-check:${accepted.checkId}`;
    const stored = JSON.parse((await client.get(key))!) as { acceptedAt: number };
    stored.acceptedAt = Date.now() - SAMPLE_QUEUE_WAIT_MS - 1_000;
    await client.set(key, JSON.stringify(stored), "KEEPTTL");

    // The worker's own wait check ends it; the reader must not contradict it.
    await runner.run(accepted.checkId);
    const view = await read(student, accepted.checkId);

    expect(view.status).toBe("TIMED_OUT");
    expect(view.result).toBeNull();
  }, 60_000);

  it("withholds the rule once the case changed after the check", async () => {
    const done = await check(1, doubling);
    expect(done.result!.rule).not.toBeNull();

    // The Manager edits the problem: the revision moves.
    const current = await courses.getExercise(manager, { academyId: ids.academy, courseId, lectureId, materialId });
    const exercise = current.material!.programmingExercise!;
    await courses.updateExercise(
      manager,
      updateProgrammingExerciseSchema.parse({
        academyId: ids.academy,
        courseId,
        lectureId,
        materialId,
        expectedUpdatedAt: exercise.updatedAt,
        title: "Double",
        difficulty: "EASY",
        description: exercise.description,
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        starterCode: "",
        solutionCode: doubling,
        aiFeedbackEnabled: false,
        isVisible: true,
        testCases: [{ ...cases[0]!, visibility: "HIDDEN" }, ...cases.slice(1)],
        grading: defaultEliceGradingProfile,
        hints: [],
      }),
    );

    const after = await read(student, done.checkId);
    expect(after.refreshRequired).toBe(true);
    expect(after.result).toEqual(expect.objectContaining({ outcome: "PASSED", rule: null }));
    revision += 1;
  }, 60_000);

  it("is unavailable when the academy has not turned it on", async () => {
    await prisma.academyFeatureFlag.update({
      where: { academyId_feature: { academyId: ids.academy, feature: "SERVER_SAMPLE_CHECKS" } },
      data: { isEnabled: false },
    });
    try {
      await expect(start(student, { position: 2, code: doubling })).rejects.toMatchObject({
        code: "SAMPLE_CHECK_UNAVAILABLE",
      });
    } finally {
      await prisma.academyFeatureFlag.update({
        where: { academyId_feature: { academyId: ids.academy, feature: "SERVER_SAMPLE_CHECKS" } },
        data: { isEnabled: true },
      });
    }
  });

  it("never let a hidden case's text into any response", () => {
    expect(responses.length).toBeGreaterThan(10);
    expect(JSON.stringify(responses)).not.toContain(SENTINEL);
  });
});
