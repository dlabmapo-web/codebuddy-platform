import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { developmentOrganization } from "./data/organizations.js";
import { developmentUsers } from "./data/users.js";

/**
 * A content library with something published in it.
 *
 * The library is created on first use by `platformLibrary.create`, so a fresh
 * development database has none — which is correct, and is exactly the empty
 * page a developer meets. This fills it, so the adopt journey can be walked
 * without authoring a master by hand first.
 *
 * Two masters, and the pair is the point: one published and adoptable, one
 * still a draft. A library holding only published courses would let a bug that
 * offers drafts to academies pass unnoticed, which is the one thing the
 * `available` query must never do.
 *
 * Fixed ids make it idempotent — rerunning updates in place rather than piling
 * up near-duplicate masters in a shared database.
 */
export const libraryFixture = {
  academyId: "f0000000-0000-4000-8000-000000000001",
  publishedCourseId: "f0000000-0000-4000-8000-000000000010",
  draftCourseId: "f0000000-0000-4000-8000-000000000011",
  moduleId: "f0000000-0000-4000-8000-000000000020",
  lectureId: "f0000000-0000-4000-8000-000000000030",
  materialId: "f0000000-0000-4000-8000-000000000040",
  publishedTitle: "DLAB Python Level 1",
  draftTitle: "DLAB Python Level 2 (draft)",
  moduleTitle: "Variables and input",
  lectureTitle: "Reading a line",
  problemTitle: "Echo the input",
} as const;

export async function seedLibraryFixture(prisma: PrismaClient) {
  const author = await prisma.user.findFirstOrThrow({
    where: { platformRole: "ADMIN" },
    select: { id: true },
  });

  const library = await prisma.academy.upsert({
    where: { id: libraryFixture.academyId },
    create: {
      id: libraryFixture.academyId,
      organizationId: developmentOrganization.id,
      kind: "LIBRARY",
      name: "Content Library",
      slug: "content-library",
    },
    update: { kind: "LIBRARY" },
    select: { id: true },
  });

  // The draft: adoptable by nobody, and the reason it is here.
  await prisma.course.upsert({
    where: { id: libraryFixture.draftCourseId },
    create: {
      id: libraryFixture.draftCourseId,
      academyId: library.id,
      title: libraryFixture.draftTitle,
      description: "Not published. Academies must not be offered this one.",
      isVisible: false,
      createdByUserId: author.id,
    },
    update: { isVisible: false, retiredAt: null },
  });

  await prisma.course.upsert({
    where: { id: libraryFixture.publishedCourseId },
    create: {
      id: libraryFixture.publishedCourseId,
      academyId: library.id,
      title: libraryFixture.publishedTitle,
      description: "Variables, input and output. Head office's master course.",
      isVisible: true,
      createdByUserId: author.id,
    },
    update: { isVisible: true, retiredAt: null },
  });

  await prisma.courseModule.upsert({
    where: { id: libraryFixture.moduleId },
    create: {
      id: libraryFixture.moduleId,
      courseId: libraryFixture.publishedCourseId,
      externalKey: "library-m1",
      title: libraryFixture.moduleTitle,
      position: 1,
      isVisible: true,
    },
    update: { title: libraryFixture.moduleTitle },
  });

  await prisma.lecture.upsert({
    where: { id: libraryFixture.lectureId },
    create: {
      id: libraryFixture.lectureId,
      courseModuleId: libraryFixture.moduleId,
      externalKey: "library-l1",
      title: libraryFixture.lectureTitle,
      position: 1,
      isVisible: true,
    },
    update: { title: libraryFixture.lectureTitle },
  });

  await prisma.material.upsert({
    where: { id: libraryFixture.materialId },
    create: {
      id: libraryFixture.materialId,
      lectureId: libraryFixture.lectureId,
      type: "PROGRAMMING_EXERCISE",
      title: libraryFixture.problemTitle,
      position: 1,
      isVisible: true,
    },
    update: { title: libraryFixture.problemTitle },
  });

  // A problem that can actually grade, so an adopted copy is teachable rather
  // than arriving with the "cannot grade" fault this page draws loudly.
  await prisma.programmingExercise.upsert({
    where: { materialId: libraryFixture.materialId },
    create: {
      materialId: libraryFixture.materialId,
      externalKey: "library-p1",
      difficulty: "EASY",
      description: "<p>Read one line and print it back.</p>",
      starterCode: "line = input()\n",
      solutionCode: "print(input())\n",
      testCases: {
        create: [
          {
            position: 1,
            input: "hello",
            expectedOutput: "hello",
            visibility: "SAMPLE",
          },
          {
            position: 2,
            input: "cove",
            expectedOutput: "cove",
            visibility: "HIDDEN",
          },
        ],
      },
    },
    update: {},
  });

  return { libraryId: library.id, author: author.id };
}

if (process.argv[1]?.endsWith("library-fixture.ts")) {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  seedLibraryFixture(prisma)
    .then(({ libraryId }) => {
      console.log(`🌱 Content library seeded (${libraryId})`);
      console.log(`   published: ${libraryFixture.publishedTitle}`);
      console.log(`   draft:     ${libraryFixture.draftTitle}`);
      console.log(
        `   authored by the first ADMIN of ${developmentUsers.length} development accounts`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
