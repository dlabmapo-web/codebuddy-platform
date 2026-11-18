import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * A library master with every material type, for walking library course sync
 * by hand on a development database (docs/superpowers/specs/2026-11-18-library-course-sync-design.md).
 *
 * It creates one published master in the organization's existing content
 * library, reusing a READY PDF and video already in the database (assets are
 * shared and immutable, as adoption already relies on), and turns on the
 * `LIBRARY_COURSE_SYNC` rollout gate for one academy. Nothing is released or
 * adopted: that is the journey to walk in the console and the academy.
 *
 * Fixed ids make it idempotent. Run with `pnpm --filter @cove/api db:seed:library-sync`;
 * `LIBRARY_SYNC_DEMO_ACADEMY` picks the academy (slug), default `gangnam-dlab`.
 */
const ids = {
  course: "5e000000-0000-4000-8000-000000000001",
  module: "5e000000-0000-4000-8000-000000000002",
  lecture: "5e000000-0000-4000-8000-000000000003",
  explanation: "5e000000-0000-4000-8000-000000000010",
  video: "5e000000-0000-4000-8000-000000000011",
  exercise: "5e000000-0000-4000-8000-000000000012",
  pdf: "5e000000-0000-4000-8000-000000000013",
  turtle: "5e000000-0000-4000-8000-000000000014",
  written: "5e000000-0000-4000-8000-000000000015",
  choice: "5e000000-0000-4000-8000-000000000016",
  optionA: "5e000000-0000-4000-8000-000000000020",
  optionB: "5e000000-0000-4000-8000-000000000021",
  optionC: "5e000000-0000-4000-8000-000000000022",
} as const;
const title = "Library sync demo · Python";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const library = await prisma.academy.findFirst({ where: { kind: "LIBRARY" }, select: { id: true, organizationId: true } });
    if (!library) throw new Error("No content library: create one in the console first.");
    const slug = process.env.LIBRARY_SYNC_DEMO_ACADEMY ?? "gangnam-dlab";
    const academy = await prisma.academy.findFirst({ where: { slug, organizationId: library.organizationId }, select: { id: true, name: true } });
    if (!academy) throw new Error(`No academy ${slug} in the library's organization.`);
    const author = await prisma.user.findFirst({ where: { platformRole: "ADMIN", status: "ACTIVE" }, select: { id: true } });
    const pdf = await prisma.pdfAsset.findFirst({ where: { state: "READY" }, select: { id: true } });
    const video = await prisma.videoAsset.findFirst({ where: { state: "READY" }, select: { id: true } });
    if (!author || !pdf || !video) throw new Error("Needs an active admin and one READY PDF and video asset.");

    await prisma.academyFeatureFlag.upsert({
      where: { academyId_feature: { academyId: academy.id, feature: "LIBRARY_COURSE_SYNC" } },
      create: { academyId: academy.id, feature: "LIBRARY_COURSE_SYNC", isEnabled: true },
      update: { isEnabled: true },
    });

    if (await prisma.course.findUnique({ where: { id: ids.course } })) {
      console.log(`"${title}" already exists; LIBRARY_COURSE_SYNC is on for ${academy.name}.`);
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.course.create({
        data: { id: ids.course, academyId: library.id, title, description: "Every material type, for library sync.", isVisible: true, createdByUserId: author.id },
      });
      await tx.courseModule.create({ data: { id: ids.module, courseId: ids.course, externalKey: "sync-demo-m1", title: "Basics", position: 1 } });
      await tx.lecture.create({ data: { id: ids.lecture, courseModuleId: ids.module, externalKey: "sync-demo-l1", title: "Variables", position: 1 } });
      const material = (id: string, type: string, materialTitle: string, position: number) => ({ id, lectureId: ids.lecture, type: type as never, title: materialTitle, position });
      await tx.material.create({ data: { ...material(ids.explanation, "EXPLANATION", "What is a variable?", 1), explanationMaterial: { create: { body: "<p>A variable holds a value.</p>" } } } });
      await tx.material.create({ data: { ...material(ids.video, "VIDEO_LESSON", "Variables in two minutes", 2), videoLesson: { create: { assetId: video.id, requestKey: crypto.randomUUID(), description: "<p>Watch, then try the problem.</p>" } } } });
      await tx.material.create({
        data: {
          ...material(ids.exercise, "PROGRAMMING_EXERCISE", "Add two numbers", 3),
          programmingExercise: {
            create: {
              externalKey: "sync-demo-p1",
              difficulty: "EASY",
              description: "<p>Read two integers and print their sum.</p>",
              starterCode: "a, b = map(int, input().split())\n",
              solutionCode: "a, b = map(int, input().split())\nprint(a + b)\n",
              solutions: { create: [{ position: 0, title: "Main", code: "a, b = map(int, input().split())\nprint(a + b)\n" }] },
              testCases: {
                create: [
                  { position: 1, input: "1 2", expectedOutput: "3", visibility: "SAMPLE" },
                  { position: 2, input: "10 20", expectedOutput: "30", visibility: "HIDDEN" },
                ],
              },
              hints: { create: [{ position: 1, content: "Use input().split()." }] },
            },
          },
        },
      });
      await tx.material.create({ data: { ...material(ids.pdf, "PDF_DOCUMENT", "Notes", 4), pdfDocument: { create: { assetId: pdf.id } } } });
      await tx.material.create({
        data: { ...material(ids.turtle, "TURTLE_EXERCISE", "Draw a square", 5), manualMaterial: { create: { description: "<p>Draw a square with sides of 100.</p>", files: { "main.py": "import turtle\n\nt = turtle.Turtle()\n" } } } },
      });
      await tx.material.create({
        data: {
          ...material(ids.written, "WRITTEN_RESPONSE", "Quick check", 6),
          manualMaterial: { create: { shortAnswer: { version: 1, question: "What does 2 + 2 print?", gradingMode: "EXACT", expectedAnswer: "4", pattern: "", explanationEnabled: false, explanation: "" } } },
        },
      });
      await tx.material.create({
        data: {
          ...material(ids.choice, "MULTIPLE_CHOICE", "Which is a list?", 7),
          manualMaterial: {
            create: {
              files: {},
              multipleChoice: {
                version: 1, question: "Which of these is a list?", problemDescription: "", selectionMode: "SINGLE",
                options: [
                  { id: ids.optionA, content: "<p>[1, 2]</p>" },
                  { id: ids.optionB, content: "<p>(1, 2)</p>" },
                  { id: ids.optionC, content: "<p>{1, 2}</p>" },
                ],
                shuffleOptions: false, explanationEnabled: false, correctOptionIds: [ids.optionA], explanation: "",
              },
            },
          },
        },
      });
    });
    console.log(`Created "${title}" in the library; LIBRARY_COURSE_SYNC is on for ${academy.name}.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
