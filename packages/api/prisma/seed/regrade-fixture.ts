import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { seedClassFixture } from "./class-fixtures.js";
import { developmentAcademy } from "./data/organizations.js";
import { developmentUsers } from "./data/users.js";

/**
 * Two problems already broken, so the repair can be watched rather than staged.
 *
 * Re-grading is hard to try by hand because the interesting state takes four
 * steps to reach: a student has to solve a problem, an author has to change its
 * grading, and only then does anything need repairing. Doing that through the
 * UI means waiting on the judge twice and remembering which revision you are
 * on — which is exactly where a manual test goes wrong.
 *
 * So this writes the *end* of that story directly. Both problems already carry
 * a student submission graded at revision 1, and both exercises are already at
 * revision 2, which is precisely what an author's correction leaves behind.
 * Open the Maintenance page and both are waiting.
 *
 * The two problems are the two populations a re-grade serves, and they are
 * different enough that seeing only one would teach the wrong lesson:
 *
 * - **Add two numbers** is the reported case. The student solved it, the
 *   grading changed, and their solved mark silently stopped counting. A
 *   re-grade gives it back and nothing else happens.
 *
 * - **Double a number** is the case nobody reports. A hidden test case had the
 *   wrong expected output, so it failed a correct program. That student was
 *   never told and never paid. A re-grade records the solve *and* awards the
 *   points, which is the only thing on this surface that creates rather than
 *   restores.
 *
 * Rerunnable: fixed ids throughout, and the test cases and submissions are
 * rewritten rather than appended.
 */
const lab = {
  courseId: "b2000000-0000-4000-8000-000000000001",
  moduleId: "b2000000-0000-4000-8000-000000000010",
  lectureId: "b2000000-0000-4000-8000-000000000020",
  classId: "b2000000-0000-4000-8000-000000000040",
  courseTitle: "Re-grade Test Lab",
  className: "Re-grade Test Class",
} as const;

/** The student's code, which is correct in both problems. That is the point. */
const solvedCode = "a = int(input())\nb = int(input())\nprint(a + b)\n";
const doubleCode = "n = int(input())\nprint(n * 2)\n";

const problems = [
  {
    materialId: "b2000000-0000-4000-8000-000000000030",
    submissionId: "b2000000-0000-4000-8000-000000000050",
    position: 1,
    title: "Add two numbers",
    description:
      "<p>Read two integers, each on its own line, and print their sum.</p>",
    starterCode: "a = int(input())\n",
    code: solvedCode,
    /** Solved cleanly at revision 1. The mark is what a re-grade gives back. */
    status: "PASSED" as const,
    passedCount: 3,
    score: 100,
    cases: [
      { input: "1\n2\n", expectedOutput: "3", visibility: "SAMPLE" as const },
      { input: "10\n20\n", expectedOutput: "30", visibility: "SAMPLE" as const },
      { input: "7\n8\n", expectedOutput: "15", visibility: "HIDDEN" as const },
    ],
  },
  {
    materialId: "b2000000-0000-4000-8000-000000000031",
    submissionId: "b2000000-0000-4000-8000-000000000051",
    position: 2,
    title: "Double a number",
    description:
      "<p>Read one integer and print it multiplied by two.</p>",
    starterCode: "n = int(input())\n",
    code: doubleCode,
    /**
     * Failed at revision 1 by a test case that was wrong, not by code that was.
     * The cases below are the *corrected* ones — `5 → 10`, as it should always
     * have been — so re-grading this submission passes it.
     */
    status: "FAILED" as const,
    passedCount: 1,
    score: 33,
    cases: [
      { input: "3\n", expectedOutput: "6", visibility: "SAMPLE" as const },
      { input: "5\n", expectedOutput: "10", visibility: "HIDDEN" as const },
      { input: "0\n", expectedOutput: "0", visibility: "HIDDEN" as const },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const teamLead = developmentUsers.find(
    (user) => user.academyRole === "TEAM_LEAD",
  )!;
  const studentEmail = developmentUsers.find(
    (user) => user.academyRole === "STUDENT",
  )!.email;

  const academy = await prisma.academy.findUniqueOrThrow({
    where: { id: developmentAcademy.id },
    select: { id: true, name: true },
  });

  await prisma.course.upsert({
    where: { id: lab.courseId },
    create: {
      id: lab.courseId,
      academyId: academy.id,
      title: lab.courseTitle,
      description: "Two problems whose grading changed after they were answered.",
      isVisible: true,
      createdByUserId: teamLead.id,
    },
    update: { academyId: academy.id, title: lab.courseTitle, isVisible: true },
  });

  await prisma.courseModule.upsert({
    where: { id: lab.moduleId },
    create: {
      id: lab.moduleId,
      courseId: lab.courseId,
      externalKey: lab.moduleId.toUpperCase(),
      title: "Repairs",
      description: "",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });

  await prisma.lecture.upsert({
    where: { id: lab.lectureId },
    create: {
      id: lab.lectureId,
      courseModuleId: lab.moduleId,
      externalKey: lab.lectureId.toUpperCase(),
      title: "Two stories",
      description: "",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });

  // Before the submissions, which carry its id: class attribution is what
  // point awards and class rankings read, so a fixture answer without one
  // would exercise a path no real submission takes.
  const { enrolled } = await seedClassFixture(prisma, {
    classId: lab.classId,
    academyId: academy.id,
    name: lab.className,
    description: "Grants the development student access to the re-grade lab.",
    createdByUserId: teamLead.id,
    courseIds: [lab.courseId],
    studentEmails: [studentEmail],
    teacherEmail: developmentUsers.find(
      (user) => user.academyRole === "TEACHER",
    )?.email,
  });

  const student = await prisma.academyMembership.findFirstOrThrow({
    where: {
      academyId: academy.id,
      role: "STUDENT",
      status: "ACTIVE",
      user: { email: studentEmail },
    },
    select: { userId: true },
  });

  // Two days ago, so the student reads as recently active rather than stalled.
  const answeredAt = new Date(Date.now() - 2 * 86_400_000);

  for (const problem of problems) {
    await prisma.material.upsert({
      where: { id: problem.materialId },
      create: {
        id: problem.materialId,
        lectureId: lab.lectureId,
        type: "PROGRAMMING_EXERCISE",
        title: problem.title,
        position: problem.position,
        isVisible: true,
      },
      update: { title: problem.title, isVisible: true },
    });

    await prisma.programmingExercise.upsert({
      where: { materialId: problem.materialId },
      create: {
        materialId: problem.materialId,
        externalKey: problem.materialId.toUpperCase(),
        difficulty: "EASY",
        description: problem.description,
        inputFormat: "",
        outputFormat: "",
        starterCode: problem.starterCode,
        // Two, not one. The submission below is stamped revision 1, so the
        // problem is already one correction ahead of the work answered against
        // it — which is the whole state this fixture exists to produce.
        gradingRevision: 2,
      },
      update: { description: problem.description, gradingRevision: 2 },
    });

    // The author's corrected cases. Rewritten rather than upserted: the fixture
    // owns the whole list, and a stale extra case would change every verdict.
    await prisma.exerciseTestCase.deleteMany({
      where: { exerciseMaterialId: problem.materialId },
    });
    await prisma.exerciseTestCase.createMany({
      data: problem.cases.map((testCase, index) => ({
        exerciseMaterialId: problem.materialId,
        position: index + 1,
        ...testCase,
      })),
    });

    // The student's answer, as it was judged before the correction.
    await prisma.submission.deleteMany({ where: { id: problem.submissionId } });
    await prisma.submission.create({
      data: {
        id: problem.submissionId,
        userId: student.userId,
        materialId: problem.materialId,
        sourceMaterialId: problem.materialId,
        courseId: lab.courseId,
        classId: lab.classId,
        gradingRevision: 1,
        language: "PYTHON",
        timeLimitMs: 3_000,
        memoryLimitMb: 256,
        code: problem.code,
        status: problem.status,
        passedCount: problem.passedCount,
        totalCount: problem.cases.length,
        score: problem.score,
        runtimeMs: 21,
        engineVersion: "seed",
        startedAt: answeredAt,
        gradedAt: answeredAt,
        createdAt: answeredAt,
        problemTitle: problem.title,
        courseTitle: lab.courseTitle,
        moduleTitle: "Repairs",
        lectureTitle: "Two stories",
        modulePosition: 1,
        lecturePosition: 1,
        problemPosition: problem.position,
        gradingCases: {
          create: problem.cases.map((testCase, index) => ({
            position: index + 1,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            isSample: testCase.visibility === "SAMPLE",
          })),
        },
      },
    });

    // The record the correction invalidated. Written at revision 1 so the
    // student's page distrusts it exactly as it would in production.
    await prisma.studentExerciseProgress.upsert({
      where: {
        userId_materialId: {
          userId: student.userId,
          materialId: problem.materialId,
        },
      },
      create: {
        userId: student.userId,
        materialId: problem.materialId,
        status: problem.status === "PASSED" ? "SOLVED" : "IN_PROGRESS",
        attemptCount: 1,
        bestPassed: problem.passedCount,
        bestScore: problem.score,
        gradingRevision: 1,
        firstSolvedAt: problem.status === "PASSED" ? answeredAt : null,
        lastAttemptAt: answeredAt,
      },
      update: {
        status: problem.status === "PASSED" ? "SOLVED" : "IN_PROGRESS",
        attemptCount: 1,
        bestPassed: problem.passedCount,
        bestScore: problem.score,
        gradingRevision: 1,
        lastAttemptAt: answeredAt,
      },
    });
  }

  // Any run left over from a previous pass would hold these problems as
  // claimed, and the board would report them as running while nothing ran.
  await prisma.platformOperationRun.deleteMany({
    where: { targetId: { in: problems.map((problem) => problem.materialId) } },
  });

  console.log(`\n🌱 Re-grade Test Lab ready in ${academy.name}`);
  console.log(`   course:  ${lab.courseTitle}`);
  console.log(`   class:   ${lab.className} (${enrolled} enrolled)`);
  console.log(`   both problems are at revision 2, answered at revision 1\n`);
  console.log(`   Add two numbers  — solved, mark now not counted`);
  console.log(`   Double a number  — failed by a wrong test case, code is right\n`);
  console.log(`   Sign in as cove-manager and open Curriculum → Maintenance.\n`);

  await prisma.$disconnect();
}

void main();
