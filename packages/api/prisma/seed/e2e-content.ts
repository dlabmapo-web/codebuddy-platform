import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { seedClassFixture } from "./class-fixtures.js";
import { developmentOrganization } from "./data/organizations.js";
import { developmentUsers } from "./data/users.js";
import { seedMonitoringFixture } from "./monitoring-fixtures.js";
import { progressFixture, seedProgressFixture } from "./progress-fixtures.js";

/**
 * A visible course for end-to-end tests.
 *
 * Fixed ids make it idempotent: rerunning updates in place rather than piling
 * up near-duplicate courses in the shared development database. The content is
 * deliberately small but covers the shapes the student pages branch on — two
 * modules, a multi-lecture module, a hidden lecture, and an exercise with
 * both sample and hidden test cases.
 */
export const e2eContent = {
  courseId: "e0000000-0000-4000-8000-000000000001",
  classId: "e0000000-0000-4000-8000-000000000040",
  className: "E2E Cohort",
  moduleOneId: "e0000000-0000-4000-8000-000000000010",
  moduleTwoId: "e0000000-0000-4000-8000-000000000011",
  lectureOneId: "e0000000-0000-4000-8000-000000000020",
  lectureTwoId: "e0000000-0000-4000-8000-000000000021",
  hiddenLectureId: "e0000000-0000-4000-8000-000000000022",
  echoMaterialId: "e0000000-0000-4000-8000-000000000030",
  sumMaterialId: "e0000000-0000-4000-8000-000000000031",
  hiddenMaterialId: "e0000000-0000-4000-8000-000000000032",
  courseTitle: "E2E Python Basics",
  echoTitle: "Echo the input",
  sumTitle: "Sum two numbers",
  /** Printed on the guided lecture card the course outline now renders. */
  lectureOneDescription: "Read a line of input and print it back out.",
  hiddenExerciseTitle: "Never visible to students",
  /** Authored order matters: the workspace reveals this list front to back. */
  echoHints: [
    "Read one line with input().",
    "Store what you read in a variable.",
    "Print the variable back out.",
  ],
  /** Must never appear in any student-facing response. */
  hiddenSentinel: "E2E_HIDDEN_SENTINEL",
  /** The problem the teacher Solution status journey reads. */
  progressMaterialId: progressFixture.materialId,
  progressTitle: progressFixture.title,
} as const;

/** A second membership used only to exercise My Page academy switching. */
export const e2eProfileAcademy = {
  academyId: "e1000000-0000-4000-8000-000000000001",
  membershipId: "e1000000-0000-4000-8000-000000000002",
  name: "E2E Profile Academy",
  slug: "e2e-profile-academy",
} as const;

const teamLead = developmentUsers.find((user) => user.academyRole === "TEAM_LEAD")!;

export async function seedE2eContent(prisma: PrismaClient) {
  const academy = await prisma.academy.findFirstOrThrow({
    where: { organization: { slug: developmentOrganization.slug } },
    select: { id: true },
  });

  await prisma.academy.upsert({
    where: { id: e2eProfileAcademy.academyId },
    create: {
      id: e2eProfileAcademy.academyId,
      organizationId: developmentOrganization.id,
      name: e2eProfileAcademy.name,
      slug: e2eProfileAcademy.slug,
      status: "ACTIVE",
    },
    update: {
      name: e2eProfileAcademy.name,
      slug: e2eProfileAcademy.slug,
      status: "ACTIVE",
    },
  });
  const student = developmentUsers.find((user) => user.academyRole === "STUDENT")!;
  await prisma.academyMembership.upsert({
    where: {
      academyId_userId: {
        academyId: e2eProfileAcademy.academyId,
        userId: student.id,
      },
    },
    create: {
      id: e2eProfileAcademy.membershipId,
      academyId: e2eProfileAcademy.academyId,
      userId: student.id,
      role: "STUDENT",
      status: "ACTIVE",
      joinedAt: new Date("2026-08-14T00:00:00.000Z"),
    },
    update: {
      role: "STUDENT",
      status: "ACTIVE",
      suspendedAt: null,
    },
  });

  await prisma.course.upsert({
    where: { id: e2eContent.courseId },
    create: {
      id: e2eContent.courseId,
      academyId: academy.id,
      title: e2eContent.courseTitle,
      description: "Fixture course used by the Playwright student journey.",
      isVisible: true,
      createdByUserId: teamLead.id,
    },
    update: { title: e2eContent.courseTitle, isVisible: true },
  });

  const modules = [
    { id: e2eContent.moduleOneId, title: "Getting started", position: 1, isVisible: true },
    { id: e2eContent.moduleTwoId, title: "Doing arithmetic", position: 2, isVisible: true },
  ];
  for (const module of modules) {
    await prisma.courseModule.upsert({
      where: { id: module.id },
      create: {
        ...module,
        courseId: e2eContent.courseId,
        description: "",
        externalKey: module.id.toUpperCase(),
      },
      update: { title: module.title, position: module.position, isVisible: module.isVisible },
    });
  }

  const lectures = [
    {
      id: e2eContent.lectureOneId,
      moduleId: e2eContent.moduleOneId,
      title: "Reading input",
      // The guided lecture card prints this, so the fixture authors one.
      description: e2eContent.lectureOneDescription,
      position: 1,
      isVisible: true,
    },
    {
      id: e2eContent.lectureTwoId,
      moduleId: e2eContent.moduleTwoId,
      title: "Adding numbers",
      description: "Combine two numbers you have read from input.",
      position: 1,
      isVisible: true,
    },
    // Present in the version, invisible to students. Proves the filter.
    {
      id: e2eContent.hiddenLectureId,
      moduleId: e2eContent.moduleTwoId,
      title: "Hidden lecture",
      description: "",
      position: 2,
      isVisible: false,
    },
  ];
  for (const lecture of lectures) {
    await prisma.lecture.upsert({
      where: { id: lecture.id },
      create: {
        id: lecture.id,
        courseModuleId: lecture.moduleId,
        externalKey: lecture.id.toUpperCase(),
        title: lecture.title,
        description: lecture.description,
        position: lecture.position,
        isVisible: lecture.isVisible,
      },
      update: {
        title: lecture.title,
        description: lecture.description,
        isVisible: lecture.isVisible,
      },
    });
  }

  const exercises = [
    {
      materialId: e2eContent.echoMaterialId,
      lectureId: e2eContent.lectureOneId,
      title: e2eContent.echoTitle,
      position: 1,
      isVisible: true,
      externalKey: "e2e-echo",
      starterCode: "value = input()\n",
      difficulty: "EASY" as const,
      cases: [
        { position: 1, input: "hello\n", expectedOutput: "hello", visibility: "SAMPLE" as const },
        { position: 2, input: `${e2eContent.hiddenSentinel}\n`, expectedOutput: e2eContent.hiddenSentinel, visibility: "HIDDEN" as const },
      ],
      // The only seeded exercise with hints, so the student journey can prove
      // both branches: progressive reveal here, no control at all on the next.
      hints: e2eContent.echoHints.map((content, index) => ({
        position: index + 1,
        content,
      })),
    },
    {
      materialId: e2eContent.sumMaterialId,
      lectureId: e2eContent.lectureTwoId,
      title: e2eContent.sumTitle,
      position: 1,
      isVisible: true,
      externalKey: "e2e-sum",
      starterCode: "a = int(input())\nb = int(input())\n",
      difficulty: "MEDIUM" as const,
      cases: [
        { position: 1, input: "1\n2\n", expectedOutput: "3", visibility: "SAMPLE" as const },
        { position: 2, input: "10\n20\n", expectedOutput: `30 ${e2eContent.hiddenSentinel}`, visibility: "HIDDEN" as const },
      ],
    },
    {
      materialId: e2eContent.hiddenMaterialId,
      lectureId: e2eContent.lectureOneId,
      title: e2eContent.hiddenExerciseTitle,
      position: 2,
      isVisible: false,
      externalKey: "e2e-hidden",
      starterCode: "",
      difficulty: "HARD" as const,
      cases: [
        { position: 1, input: "x", expectedOutput: e2eContent.hiddenSentinel, visibility: "SAMPLE" as const },
      ],
    },
  ];

  for (const exercise of exercises) {
    await prisma.material.upsert({
      where: { id: exercise.materialId },
      create: {
        id: exercise.materialId,
        lectureId: exercise.lectureId,
        type: "PROGRAMMING_EXERCISE",
        title: exercise.title,
        position: exercise.position,
        isVisible: exercise.isVisible,
      },
      update: { title: exercise.title, isVisible: exercise.isVisible },
    });

    await prisma.programmingExercise.upsert({
      where: { materialId: exercise.materialId },
      create: {
        materialId: exercise.materialId,
        externalKey: exercise.externalKey,
        difficulty: exercise.difficulty,
        description: `<p>${exercise.title}</p>`,
        inputFormat: "Standard input",
        outputFormat: "Standard output",
        constraints: "",
        starterCode: exercise.starterCode,
      },
      update: { starterCode: exercise.starterCode, difficulty: exercise.difficulty },
    });

    await prisma.exerciseTestCase.deleteMany({
      where: { exerciseMaterialId: exercise.materialId },
    });
    await prisma.exerciseTestCase.createMany({
      data: exercise.cases.map((testCase) => ({
        exerciseMaterialId: exercise.materialId,
        ...testCase,
      })),
    });

    // Replaced rather than upserted, for the same reason the cases are: the
    // fixture owns the whole list, and a shortened list has to shrink.
    await prisma.exerciseHint.deleteMany({
      where: { exerciseMaterialId: exercise.materialId },
    });
    if (exercise.hints?.length) {
      await prisma.exerciseHint.createMany({
        data: exercise.hints.map((hint) => ({
          exerciseMaterialId: exercise.materialId,
          ...hint,
        })),
      });
    }
  }

  // Without this the Playwright student is enrolled nowhere and the whole
  // journey sees an empty catalog, however visible the curriculum is. The
  // teacher assignment gives the teacher-assignment specs a class that starts
  // assigned, which is the state replacement and removal are tested from.
  const { enrolled, teacherAssigned } = await seedClassFixture(prisma, {
    classId: e2eContent.classId,
    academyId: academy.id,
    name: e2eContent.className,
    description: "Fixture class that grants the Playwright student access.",
    createdByUserId: teamLead.id,
    courseIds: [e2eContent.courseId],
    studentEmails: developmentUsers
      .filter((user) => user.academyRole === "STUDENT")
      .map((user) => user.email),
    teacherEmail: developmentUsers.find(
      (user) => user.academyRole === "TEACHER",
    )?.email,
  });

  // Puts the academy inside the monitoring rollout and leaves the fixture
  // student mid-solution with feedback already stored, which is the state the
  // teacher monitoring journey starts from.
  const monitoring = await seedMonitoringFixture(prisma, {
    academyId: academy.id,
    classId: e2eContent.classId,
    materialId: e2eContent.sumMaterialId,
  });

  // A problem with three failed attempts behind it, so the teacher's
  // Solution status page has an attention state to read rather than a class
  // that has never submitted anything.
  const progress = await seedProgressFixture(prisma, {
    academyId: academy.id,
    classId: e2eContent.classId,
    courseId: e2eContent.courseId,
    lectureId: e2eContent.lectureTwoId,
    position: 2,
  });

  return { academyId: academy.id, enrolled, teacherAssigned, monitoring, progress };
}

if (process.argv[1]?.endsWith("e2e-content.ts")) {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  seedE2eContent(prisma)
    .then(({ academyId, enrolled, teacherAssigned, monitoring, progress }) => {
      console.log(`🌱 E2E content seeded for academy ${academyId}`);
      console.log(`   class:    ${e2eContent.className} (${enrolled} enrolled)`);
      console.log(
        `   teacher:  ${teacherAssigned ? "assigned" : "unassigned"}`,
      );
      console.log(
        `   monitoring: enabled for ${monitoring.studentMembershipId}`,
      );
      console.log(
        `   progress: ${progress.attempts} failed attempts on "${progressFixture.title}"`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
