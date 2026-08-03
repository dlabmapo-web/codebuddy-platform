import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { validateEnvironment } from "../../src/config/env.schema.js";
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { seedClassFixture } from "./class-fixtures.js";
import { developmentOrganization } from "./data/organizations.js";
import { developmentUsers } from "./data/users.js";

/**
 * A visible problem for manual exploration.
 *
 * Kept in its own course, separate from the Playwright fixture, so
 * `db:seed:e2e` never disturbs it and manual submissions never interfere with
 * the automated suite.
 *
 * The test cases are chosen so every outcome the workspace can render is
 * reachable by hand: the samples are satisfied by an obvious solution, while
 * one hidden case covers an edge an obvious solution usually misses. Passing
 * the samples and failing that case is the interesting path — it is what a
 * student actually experiences, and it exercises hidden non-disclosure.
 *
 * Rerunnable: fixed ids, and the test cases are replaced rather than appended.
 */
const sandbox = {
  courseId: "a1000000-0000-4000-8000-000000000001",
  moduleId: "a1000000-0000-4000-8000-000000000010",
  lectureId: "a1000000-0000-4000-8000-000000000020",
  materialId: "a1000000-0000-4000-8000-000000000030",
  classId: "a1000000-0000-4000-8000-000000000040",
  courseTitle: "Manual Testing Sandbox",
  className: "Manual Testing Class",
  exerciseTitle: "FizzBuzz for one number",
} as const;

const teamLead = developmentUsers.find(
  (user) => user.academyRole === "TEAM_LEAD",
)!;

const description = `
<p>Read a single integer from input and print one line:</p>
<ul>
  <li><code>FIZZBUZZ</code> if it divides by both 3 and 5</li>
  <li><code>FIZZ</code> if it divides by 3</li>
  <li><code>BUZZ</code> if it divides by 5</li>
  <li>otherwise the number itself</li>
</ul>
<p>Check the order of your conditions carefully.</p>
`.trim();

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });

  const academy = await prisma.academy.findFirstOrThrow({
    where: { organization: { slug: developmentOrganization.slug } },
    select: { id: true, name: true },
  });

  await prisma.course.upsert({
    where: { id: sandbox.courseId },
    create: {
      id: sandbox.courseId,
      academyId: academy.id,
      title: sandbox.courseTitle,
      description: "A published problem for trying the student flow by hand.",
      isVisible: true,
      createdByUserId: teamLead.id,
    },
    update: { title: sandbox.courseTitle, isVisible: true },
  });

  await prisma.courseModule.upsert({
    where: { id: sandbox.moduleId },
    create: {
      id: sandbox.moduleId,
      courseId: sandbox.courseId,
      title: "Conditionals",
      description: "",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });

  await prisma.lecture.upsert({
    where: { id: sandbox.lectureId },
    create: {
      id: sandbox.lectureId,
      courseModuleId: sandbox.moduleId,
      title: "Branching on remainders",
      description: "",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });

  await prisma.material.upsert({
    where: { id: sandbox.materialId },
    create: {
      id: sandbox.materialId,
      lectureId: sandbox.lectureId,
      type: "PROGRAMMING_EXERCISE",
      title: sandbox.exerciseTitle,
      position: 1,
      isVisible: true,
    },
    update: { title: sandbox.exerciseTitle, isVisible: true },
  });

  await prisma.programmingExercise.upsert({
    where: { materialId: sandbox.materialId },
    create: {
      materialId: sandbox.materialId,
      externalKey: "manual-fizzbuzz",
      difficulty: "EASY",
      description,
      inputFormat: "One integer on a single line.",
      outputFormat: "One line: FIZZBUZZ, FIZZ, BUZZ, or the number.",
      constraints: "0 <= n <= 1000",
      starterCode: "n = int(input())\n",
      // Low enough that an infinite loop returns a verdict quickly.
      timeLimitMs: 3000,
      memoryLimitMb: 256,
    },
    update: { description, starterCode: "n = int(input())\n" },
  });

  await prisma.exerciseTestCase.deleteMany({
    where: { exerciseMaterialId: sandbox.materialId },
  });
  await prisma.exerciseTestCase.createMany({
    // `as const` on each visibility: in an array literal the strings otherwise
    // widen to `string`, which Prisma's generated `TestCaseVisibility` rejects.
    data: [
      // Visible in the workspace and runnable locally with Run.
      { position: 1, input: "9\n", expectedOutput: "FIZZ", visibility: "SAMPLE" as const },
      { position: 2, input: "20\n", expectedOutput: "BUZZ", visibility: "SAMPLE" as const },
      // Only the server ever sees these.
      { position: 3, input: "7\n", expectedOutput: "7", visibility: "HIDDEN" as const },
      // The edge case: checking 3 before 15 makes this print FIZZ. A solution
      // that passes both samples still fails here, which is the whole point.
      { position: 4, input: "30\n", expectedOutput: "FIZZBUZZ", visibility: "HIDDEN" as const },
      { position: 5, input: "0\n", expectedOutput: "FIZZBUZZ", visibility: "HIDDEN" as const },
    ].map((testCase) => ({
      exerciseMaterialId: sandbox.materialId,
      ...testCase,
    })),
  });

  // The sandbox course is unreachable until a class assigns it to a student.
  const { enrolled } = await seedClassFixture(prisma, {
    classId: sandbox.classId,
    academyId: academy.id,
    name: sandbox.className,
    description: "Grants the development student access to the sandbox course.",
    createdByUserId: teamLead.id,
    courseIds: [sandbox.courseId],
    studentEmails: developmentUsers
      .filter((user) => user.academyRole === "STUDENT")
      .map((user) => user.email),
  });

  const student = await prisma.user.findFirst({
    where: { email: "student@cove.test" },
    select: { id: true },
  });
  if (student) {
    // A rerun should hand back a clean slate: no stale verdict, no draft, and
    // nothing left in flight to trip the one-in-flight constraint.
    await prisma.submission.deleteMany({
      where: { userId: student.id, materialId: sandbox.materialId },
    });
    await prisma.studentExerciseProgress.deleteMany({
      where: { userId: student.id, materialId: sandbox.materialId },
    });
    await prisma.exerciseDraft.deleteMany({
      where: { userId: student.id, materialId: sandbox.materialId },
    });
  }

  console.log(`🌱 "${sandbox.exerciseTitle}" ready in ${academy.name}`);
  console.log(`   course:   ${sandbox.courseTitle}`);
  console.log(`   class:    ${sandbox.className} (${enrolled} enrolled)`);
  console.log(`   material: ${sandbox.materialId}`);
  console.log(`   cases:    2 sample, 3 hidden`);
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
