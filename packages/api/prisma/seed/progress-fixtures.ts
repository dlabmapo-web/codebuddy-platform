import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * The teacher Solution status fixture: one problem with a history nobody has
 * to create by hand.
 *
 * It owns its own exercise rather than borrowing one of the shared e2e
 * problems, because the student journey submits against those and a passing
 * attempt would silently erase the attention state this fixture exists to
 * produce. Nothing else writes to `progress-reverse`, so "three failures in a
 * row" stays true however many other specs have run.
 *
 * Timestamps are anchored to the seed run rather than to fixed dates: two of
 * the three attention rules are relative to now, and a fixture pinned to a
 * calendar date would start reporting a stalled student the week after it was
 * written.
 */

export const progressFixture = {
  materialId: "e0000000-0000-4000-8000-000000000033",
  title: "Reverse a string",
  /** Newest first, the way the attention window reads them. */
  submissionIds: [
    "e0000000-0000-4000-8000-000000000060",
    "e0000000-0000-4000-8000-000000000061",
    "e0000000-0000-4000-8000-000000000062",
  ],
  /** Over the 1,800s threshold, so the latest failure also reads as a long solve. */
  latestSolveElapsedSec: 2_400,
  failedCode: "value = input()\nprint(value)\n",
  sampleInput: "abc\n",
  sampleExpected: "cba",
  sampleActual: "abc",
} as const;

export async function seedProgressFixture(
  prisma: PrismaClient,
  fixture: {
    academyId: string;
    classId: string;
    courseId: string;
    /** The lecture the fixture problem is added to. */
    lectureId: string;
    /** Position inside that lecture. Must not collide with a seeded problem. */
    position: number;
  },
): Promise<{ studentMembershipId: string; attempts: number }> {
  await prisma.material.upsert({
    where: { id: progressFixture.materialId },
    create: {
      id: progressFixture.materialId,
      lectureId: fixture.lectureId,
      type: "PROGRAMMING_EXERCISE",
      title: progressFixture.title,
      position: fixture.position,
      isRequired: true,
      isVisible: true,
    },
    update: { title: progressFixture.title, isVisible: true },
  });

  await prisma.programmingExercise.upsert({
    where: { materialId: progressFixture.materialId },
    create: {
      materialId: progressFixture.materialId,
      externalKey: "e2e-progress-reverse",
      difficulty: "MEDIUM",
      description: "<p>Print the input line reversed.</p>",
      inputFormat: "Standard input",
      outputFormat: "Standard output",
      constraints: "",
      starterCode: "value = input()\n",
    },
    update: { difficulty: "MEDIUM" },
  });

  await prisma.exerciseTestCase.deleteMany({
    where: { exerciseMaterialId: progressFixture.materialId },
  });
  await prisma.exerciseTestCase.createMany({
    data: [
      {
        exerciseMaterialId: progressFixture.materialId,
        position: 1,
        input: progressFixture.sampleInput,
        expectedOutput: progressFixture.sampleExpected,
        visibility: "SAMPLE",
      },
      {
        exerciseMaterialId: progressFixture.materialId,
        position: 2,
        input: "hello\n",
        expectedOutput: "olleh",
        visibility: "HIDDEN",
      },
    ],
  });

  // Asserted, not created: a fixture that quietly enrolled somebody would
  // hide the very precondition the teacher's page depends on.
  const enrollment = await prisma.classEnrollment.findFirst({
    where: {
      classId: fixture.classId,
      membership: {
        academyId: fixture.academyId,
        role: "STUDENT",
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
    },
    select: { membershipId: true, membership: { select: { userId: true } } },
    orderBy: [{ enrolledAt: "asc" }, { membershipId: "asc" }],
  });
  if (!enrollment) {
    throw new Error(
      `Progress fixture: class ${fixture.classId} has no active enrolled student.`,
    );
  }
  const userId = enrollment.membership.userId;

  // Two days ago, so the student reads as recently active rather than stalled.
  const latest = new Date(Date.now() - 2 * 86_400_000);

  for (const [index, submissionId] of progressFixture.submissionIds.entries()) {
    const createdAt = new Date(latest.getTime() - index * 3_600_000);
    const solveElapsedSec =
      index === 0 ? progressFixture.latestSolveElapsedSec : 600;

    await prisma.submission.upsert({
      where: { id: submissionId },
      create: {
        id: submissionId,
        userId,
        materialId: progressFixture.materialId,
        sourceMaterialId: progressFixture.materialId,
        courseId: fixture.courseId,
        gradingRevision: 1,
        language: "PYTHON",
        timeLimitMs: 3_000,
        memoryLimitMb: 256,
        code: progressFixture.failedCode,
        status: "FAILED",
        passedCount: 1,
        totalCount: 2,
        score: 50,
        runtimeMs: 18,
        engineVersion: "seed",
        solveElapsedSec,
        startedAt: createdAt,
        gradedAt: createdAt,
        createdAt,
        problemTitle: progressFixture.title,
        courseTitle: "E2E Python Basics",
        moduleTitle: "Doing arithmetic",
        lectureTitle: "Adding numbers",
        modulePosition: 2,
        lecturePosition: 1,
        problemPosition: fixture.position,
      },
      update: { createdAt, solveElapsedSec, status: "FAILED" },
    });

    // Rewritten rather than upserted: the fixture owns the whole case list.
    await prisma.submissionGradingCase.deleteMany({
      where: { submissionId },
    });
    await prisma.submissionGradingCase.createMany({
      data: [
        {
          submissionId,
          position: 1,
          input: progressFixture.sampleInput,
          expectedOutput: progressFixture.sampleExpected,
          isSample: true,
        },
        {
          submissionId,
          position: 2,
          input: "hello\n",
          expectedOutput: "olleh",
          isSample: false,
        },
      ],
    });

    await prisma.submissionCase.deleteMany({ where: { submissionId } });
    await prisma.submissionCase.createMany({
      data: [
        {
          submissionId,
          position: 1,
          isSample: true,
          outcome: "PASSED",
          runtimeMs: 9,
          actualOutput: progressFixture.sampleExpected,
        },
        {
          // Hidden: an outcome and nothing else, exactly as the judge writes
          // it. The teacher review contract can only report it as a count.
          submissionId,
          position: 2,
          isSample: false,
          outcome: "WRONG_OUTPUT",
          runtimeMs: 11,
          actualOutput: null,
        },
      ],
    });
  }

  await prisma.studentExerciseProgress.upsert({
    where: {
      userId_materialId: { userId, materialId: progressFixture.materialId },
    },
    create: {
      userId,
      materialId: progressFixture.materialId,
      status: "IN_PROGRESS",
      attemptCount: progressFixture.submissionIds.length,
      bestPassed: 1,
      bestScore: 50,
      gradingRevision: 1,
      lastAttemptAt: latest,
    },
    update: {
      status: "IN_PROGRESS",
      attemptCount: progressFixture.submissionIds.length,
      bestPassed: 1,
      bestScore: 50,
      lastAttemptAt: latest,
    },
  });

  return {
    studentMembershipId: enrollment.membershipId,
    attempts: progressFixture.submissionIds.length,
  };
}
