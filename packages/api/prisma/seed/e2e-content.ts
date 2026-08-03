import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { developmentOrganization } from "./data/organizations.js";
import { developmentUsers } from "./data/users.js";

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
  hiddenExerciseTitle: "Never visible to students",
  /** Must never appear in any student-facing response. */
  hiddenSentinel: "E2E_HIDDEN_SENTINEL",
} as const;

const teamLead = developmentUsers.find((user) => user.academyRole === "TEAM_LEAD")!;

export async function seedE2eContent(prisma: PrismaClient) {
  const academy = await prisma.academy.findFirstOrThrow({
    where: { organization: { slug: developmentOrganization.slug } },
    select: { id: true },
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
      create: { ...module, courseId: e2eContent.courseId, description: "" },
      update: { title: module.title, position: module.position, isVisible: module.isVisible },
    });
  }

  const lectures = [
    { id: e2eContent.lectureOneId, moduleId: e2eContent.moduleOneId, title: "Reading input", position: 1, isVisible: true },
    { id: e2eContent.lectureTwoId, moduleId: e2eContent.moduleTwoId, title: "Adding numbers", position: 1, isVisible: true },
    // Present in the version, invisible to students. Proves the filter.
    { id: e2eContent.hiddenLectureId, moduleId: e2eContent.moduleTwoId, title: "Hidden lecture", position: 2, isVisible: false },
  ];
  for (const lecture of lectures) {
    await prisma.lecture.upsert({
      where: { id: lecture.id },
      create: {
        id: lecture.id,
        courseModuleId: lecture.moduleId,
        title: lecture.title,
        description: "",
        position: lecture.position,
        isVisible: lecture.isVisible,
      },
      update: { title: lecture.title, isVisible: lecture.isVisible },
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
  }

  return { academyId: academy.id };
}

if (process.argv[1]?.endsWith("e2e-content.ts")) {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  seedE2eContent(prisma)
    .then(({ academyId }) => console.log(`🌱 E2E content seeded for academy ${academyId}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
