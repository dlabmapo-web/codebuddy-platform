import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import {
  createProgrammingExerciseSchema,
  defaultEliceGradingProfile,
  updateProgrammingExerciseSchema,
} from "@cove/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { LearningClassContextService } from "../learn/learning-class-context.service.js";
import { SubmissionService } from "../learn/submission.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { PointAwardService } from "../points/point-award.service.js";
import { ComparatorPool } from "./comparator-pool.js";
import { GradingService } from "./grading.service.js";
import type { JudgeQueue } from "./judge.queue.js";
import { PyodideExecutionEngine } from "./pyodide-engine.js";

/**
 * The decisive test: authoring → saved profile → submission snapshot →
 * enhanced grading → the score a student is shown.
 *
 * Real services against a real PostgreSQL with every migration applied, a
 * real Python runner per case and the real CPython comparator. Nothing is
 * mocked but the Redis queue (grading is invoked directly, as the worker
 * would) and live-monitoring revocation, which this path never reaches.
 *
 * Opt-in, because it needs a disposable database:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… npx vitest run \
 *     src/judge/weighted-grading.integration.spec.ts
 *
 * The fixture is exercise E2 from the research spec — three same-output cases
 * worth 30, 30 and 40 — authored by a Manager through the same contract the
 * editor posts.
 */
const url = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!url)("weighted grading, end to end", () => {
  let prisma: PrismaService;
  let courses: CourseService;
  let submissions: SubmissionService;
  let grading: GradingService;
  let engine: PyodideExecutionEngine;
  let comparator: ComparatorPool;

  const ids = {
    organization: randomUUID(),
    academy: randomUUID(),
    manager: randomUUID(),
    managerAuth: randomUUID(),
    student: randomUUID(),
    studentAuth: randomUUID(),
    studentMembership: randomUUID(),
    klass: randomUUID(),
  };
  // Unique per run, so the suite can run again on a database it has used.
  const managerEmail = `m-${ids.manager}@it.test`;
  const studentEmail = `s-${ids.student}@it.test`;
  const manager: SupabaseIdentity = { authUserId: ids.managerAuth, email: managerEmail } as SupabaseIdentity;
  const student: SupabaseIdentity = { authUserId: ids.studentAuth, email: studentEmail } as SupabaseIdentity;
  let courseId = "";
  let lectureId = "";
  let materialId = "";

  const calculatorCases = [
    { input: "3\n3\n", expectedOutput: "6\n0\n9\n1.0", weight: 30, visibility: "SAMPLE" as const },
    { input: "0\n10\n", expectedOutput: "10\n-10\n0\n0.0", weight: 30, visibility: "HIDDEN" as const },
    { input: "3\n2\n", expectedOutput: "5\n1\n6\n1.5", weight: 40, visibility: "HIDDEN" as const },
  ].map((testCase) => ({
    ...testCase,
    comparator: "STDOUT" as const,
    timeLimitMsOverride: null,
    softTimeLimitMs: null,
    softPenalty: null,
    label: null,
  }));

  /** Correct on the cases in `correct`, visibly wrong on the others. */
  const program = (correct: Array<[number, number]>) => `
a = int(input())
b = int(input())
if (a, b) in ${JSON.stringify(correct.map(([x, y]) => [x, y])).replace(/\[(\d+),(\d+)\]/g, "($1, $2)")}:
    # Trailing spaces on every line: Elice's same-output rule strips them
    # per line, which the legacy normalizer never did.
    print(a + b, "  ")
    print(a - b)
    print(a * b, " ")
    print(a / b)
else:
    print("not this one")
`;

  const submitAndGrade = async (code: string) => {
    const accepted = await submissions.submit(student, {
      academyId: ids.academy,
      materialId,
      classId: ids.klass,
      code,
    });
    await grading.grade(accepted.submissionId, async () => undefined);
    return submissions.get(student, {
      academyId: ids.academy,
      submissionId: accepted.submissionId,
    });
  };

  beforeAll(async () => {
    const config = new ConfigService({
      DATABASE_URL: url,
      PYODIDE_VERSION: "0.27.5",
      SUBMISSION_RATE_LIMIT: 100,
    });
    prisma = new PrismaService(config as never);
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    courses = new CourseService(prisma, access, new AuditService(), {
      revokeClass: async () => undefined,
    } as unknown as MonitoringRevocationService);
    const queue = {
      consumeSubmissionToken: async () => true,
      enqueue: async () => undefined,
    } as unknown as JudgeQueue;
    submissions = new SubmissionService(
      prisma,
      access,
      config as never,
      new LearningClassContextService(prisma),
      queue,
    );
    engine = new PyodideExecutionEngine("0.27.5", 2, 1);
    comparator = new ComparatorPool(1);
    grading = new GradingService(prisma, engine, new PointAwardService(prisma), comparator);
    await Promise.all([engine.warmUp(), comparator.warmUp()]);

    // People and places. Classes are not what is under test, so they are
    // written directly; everything about the problem goes through services.
    await prisma.organization.create({
      data: { id: ids.organization, name: "IT Org", slug: `it-${ids.organization.slice(0, 8)}` },
    });
    await prisma.academy.create({
      data: {
        id: ids.academy,
        organizationId: ids.organization,
        name: "IT Academy",
        slug: `it-${ids.academy.slice(0, 8)}`,
        status: "ACTIVE",
      },
    });
    await prisma.user.create({
      data: { id: ids.manager, authUserId: ids.managerAuth, status: "ACTIVE", email: managerEmail, username: `m${ids.manager.slice(0, 6)}` },
    });
    await prisma.user.create({
      data: { id: ids.student, authUserId: ids.studentAuth, status: "ACTIVE", email: studentEmail, username: `s${ids.student.slice(0, 6)}` },
    });
    await prisma.academyMembership.create({
      data: { academyId: ids.academy, userId: ids.manager, role: "MANAGER", status: "ACTIVE" },
    });
    await prisma.academyMembership.create({
      data: {
        id: ids.studentMembership,
        academyId: ids.academy,
        userId: ids.student,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });

    const course = await courses.create(manager, {
      academyId: ids.academy,
      title: "Python track",
      description: "",
    });
    courseId = course.id;
    await courses.createModule(manager, { academyId: ids.academy, courseId, title: "CH01", description: "" });
    const withModule = await prisma.courseModule.findFirstOrThrow({ where: { courseId } });
    await courses.createLecture(manager, {
      academyId: ids.academy,
      courseId,
      moduleId: withModule.id,
      title: "Input and output",
      description: "",
    });
    lectureId = (await prisma.lecture.findFirstOrThrow({ where: { courseModuleId: withModule.id } })).id;

    await prisma.class.create({
      data: { id: ids.klass, academyId: ids.academy, name: "Cohort", createdByUserId: ids.manager },
    });
    await prisma.classCourse.create({
      data: { classId: ids.klass, courseId, assignedByUserId: ids.manager },
    });
    await prisma.classEnrollment.create({
      data: { classId: ids.klass, membershipId: ids.studentMembership, enrolledByUserId: ids.manager },
    });
  }, 180_000);

  afterAll(async () => {
    await engine?.dispose();
    await comparator?.dispose();
    await prisma?.$disconnect();
  });

  it("a Manager authors a 30/30/40 weighted problem, and it is saved as written", async () => {
    // Exactly what the editor posts, through the contract the RPC layer runs.
    const input = createProgrammingExerciseSchema.parse({
      academyId: ids.academy,
      courseId,
      lectureId,
      title: "Calculator",
      difficulty: "EASY",
      description: "<p>Add, subtract, multiply and divide two integers.</p>",
      inputFormat: "",
      outputFormat: "",
      constraints: "",
      starterCode: "",
      solutionCode: "a = int(input())\nb = int(input())\nprint(a + b)\nprint(a - b)\nprint(a * b)\nprint(a / b)\n",
      aiFeedbackEnabled: false,
      isVisible: true,
      testCases: calculatorCases,
      grading: defaultEliceGradingProfile,
      hints: [],
    });
    const created = await courses.createExercise(manager, input);
    materialId = created.material!.id;

    // Published the way an author publishes: every level made visible.
    await courses.setExerciseVisibility(manager, {
      academyId: ids.academy,
      courseId,
      lectureId,
      materialId,
      isVisible: true,
    });
    await prisma.courseModule.updateMany({ where: { courseId }, data: { isVisible: true } });
    await prisma.lecture.updateMany({ where: { id: lectureId }, data: { isVisible: true } });
    await courses.setVisibility(manager, { academyId: ids.academy, courseId, isVisible: true });

    const reread = await courses.getExercise(manager, {
      academyId: ids.academy,
      courseId,
      lectureId,
      materialId,
    });
    const exercise = reread.material!.programmingExercise!;
    expect(exercise.grading).toEqual({
      mode: "ELICE_STDIO",
      semanticVersion: "elice-v1",
      totalTimeLimitMs: 60_000,
      comparatorTimeLimitMs: 100,
      materialMaximumHundredths: 10_000,
      materialScorePolicy: "PROPORTIONAL",
    });
    expect(exercise.testCases.map((testCase) => testCase.weight)).toEqual([30, 30, 40]);
  });

  it.each([
    ["only the third case", [[3, 2]], 40, "FAILED"],
    ["the first two cases", [[3, 3], [0, 10]], 60, "FAILED"],
    ["all three cases", [[3, 3], [0, 10], [3, 2]], 100, "PASSED"],
  ] as const)(
    "a student passing %s is shown %i",
    async (_name, correct, score, status) => {
      const result = await submitAndGrade(program(correct.map(([a, b]) => [a, b])));

      expect(result).toEqual(
        expect.objectContaining({
          status,
          score,
          earnedWeight: score,
          possibleWeight: 100,
        }),
      );
      expect(result.cases.map((item) => item.weight)).toEqual([30, 30, 40]);
    },
    120_000,
  );

  it("froze the profile on each submission, and records the material score", async () => {
    const rows = await prisma.submission.findMany({
      where: { materialId },
      orderBy: { createdAt: "asc" },
      include: { gradingCases: { orderBy: { position: "asc" } } },
    });

    expect(rows.map((row) => row.score)).toEqual([40, 60, 100]);
    expect(rows.map((row) => row.appliedScoreHundredths)).toEqual([4_000, 6_000, 10_000]);
    for (const row of rows) {
      expect(row.gradingMode).toBe("ELICE_STDIO");
      expect(row.gradingSemanticVersion).toBe("elice-v1");
      expect(row.gradingCases.map((testCase) => testCase.weight)).toEqual([30, 30, 40]);
      expect(row.gradingCases.map((testCase) => testCase.effectiveTimeLimitMs)).toEqual([
        3_000, 3_000, 3_000,
      ]);
      expect(row.gradingPolicySnapshot).toEqual(
        expect.objectContaining({ version: 1, semanticVersion: "elice-v1" }),
      );
    }

    const progress = await prisma.studentExerciseProgress.findUniqueOrThrow({
      where: { userId_materialId: { userId: ids.student, materialId } },
    });
    expect(progress).toEqual(
      expect.objectContaining({ status: "SOLVED", bestScore: 100, attemptCount: 3 }),
    );
  });

  it("grades a queued submission by the rules it was submitted under, not an edit made since", async () => {
    const accepted = await submissions.submit(student, {
      academyId: ids.academy,
      materialId,
      classId: ids.klass,
      code: program([[3, 2]]),
    });

    // While it waits, the Manager reweights the problem to 50/25/25.
    const current = await courses.getExercise(manager, {
      academyId: ids.academy,
      courseId,
      lectureId,
      materialId,
    });
    const exercise = current.material!.programmingExercise!;
    await courses.updateExercise(
      manager,
      updateProgrammingExerciseSchema.parse({
        academyId: ids.academy,
        courseId,
        lectureId,
        materialId,
        expectedUpdatedAt: exercise.updatedAt,
        title: "Calculator",
        difficulty: "EASY",
        description: exercise.description,
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        starterCode: "",
        solutionCode: "print()",
        aiFeedbackEnabled: false,
        isVisible: true,
        testCases: calculatorCases.map((testCase, index) => ({
          ...testCase,
          weight: [50, 25, 25][index]!,
        })),
        grading: defaultEliceGradingProfile,
        hints: [],
      }),
    );

    await grading.grade(accepted.submissionId, async () => undefined);
    const result = await submissions.get(student, {
      academyId: ids.academy,
      submissionId: accepted.submissionId,
    });

    // Still 40: the third case was worth 40 when this was submitted.
    expect(result).toEqual(
      expect.objectContaining({ score: 40, earnedWeight: 40, possibleWeight: 100 }),
    );

    // And the next attempt is graded under the new weights.
    const next = await submitAndGrade(program([[3, 2]]));
    expect(next).toEqual(expect.objectContaining({ score: 25, earnedWeight: 25 }));
  }, 180_000);
});
