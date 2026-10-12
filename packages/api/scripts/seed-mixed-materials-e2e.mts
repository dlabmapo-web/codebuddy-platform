import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConfigService } from "@nestjs/config";
import { PdfStorageService } from "../src/documents/pdf-storage.service.js";
import { validatePdf } from "../src/documents/pdf-files.js";
const project = "lnrmxjxsjxymgphgatwn";
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
    `${project}.supabase.co` ||
  (databaseUrl.hostname !== `db.${project}.supabase.co` &&
    decodeURIComponent(databaseUrl.username) !== `postgres.${project}`)
)
  throw Error("Development fixture only");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const academyId = "20000000-0000-4000-8000-000000000001",
  classId = "e0000000-0000-4000-8000-000000000040";
const id = (n: number) =>
  `ee060000-0000-4000-8000-${String(n).padStart(12, "0")}`;
try {
  const author = await db.user.findUniqueOrThrow({
    where: { username: "cove-teamlead" },
  });
  let pdf = await db.pdfAsset.findFirst({
    where: { courseId: id(1), state: "READY" },
  });
  if (!pdf) {
    const path = resolve("../../e2e/fixtures/lecture-material.pdf"),
      bytes = await readFile(path),
      assetId = randomUUID();
    const objectKey = `${academyId}/${id(1)}/${assetId}.pdf`;
    const pageCount = await validatePdf(path);
    await new PdfStorageService(new ConfigService(process.env) as never).upload(
      objectKey,
      path,
      bytes.length,
    );
    pdf = await db.pdfAsset.create({
      data: {
        id: assetId,
        objectKey,
        originalFilename: "mixed-original.pdf",
        byteSize: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        pageCount,
        uploaderUserId: author.id,
        academyId,
        courseId: id(1),
        lectureId: id(20),
        state: "READY",
      },
    });
  }
  const video = await db.videoAsset.findFirstOrThrow({
    where: { courseId: "ee050000-0000-4000-8000-000000000001", state: "READY" },
    orderBy: { createdAt: "desc" },
  });
  const turtle = await db.manualMaterial.findFirstOrThrow({
    where: {
      material: {
        type: "TURTLE_EXERCISE",
        lecture: {
          courseModule: { courseId: "ee020000-0000-4000-8000-000000000001" },
        },
      },
    },
  });
  await db.course.upsert({
    where: { id: id(1) },
    create: {
      id: id(1),
      academyId,
      title: "E2E All Five Features",
      createdByUserId: author.id,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await db.courseModule.upsert({
    where: { id: id(10) },
    create: {
      id: id(10),
      courseId: id(1),
      externalKey: "mixed",
      title: "All material types",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  for (const [position, lecture] of [20, 21].entries())
    await db.lecture.upsert({
      where: { id: id(lecture) },
      create: {
        id: id(lecture),
        courseModuleId: id(10),
        externalKey: `mixed-${lecture}`,
        title: `Mixed lecture ${position + 1}`,
        position: position + 1,
        isVisible: true,
      },
      update: { isVisible: true },
    });
  await db.$transaction(
    async (tx) => {
      const scope = {
        material: { lecture: { courseModule: { courseId: id(1) } } },
      };
      await tx.manualReview.deleteMany({ where: { submission: scope } });
      await tx.manualSubmission.deleteMany({ where: scope });
      await tx.material.deleteMany({
        where: { lecture: { courseModule: { courseId: id(1) } } },
      });
      const names = [
        "Mixed coding start",
        "Mixed PDF",
        "Mixed turtle",
        "Mixed short answer",
        "Mixed choice",
        "Mixed video",
        "Mixed coding finish",
      ];
      const types = [
        "PROGRAMMING_EXERCISE",
        "PDF_DOCUMENT",
        "TURTLE_EXERCISE",
        "WRITTEN_RESPONSE",
        "MULTIPLE_CHOICE",
        "VIDEO_LESSON",
        "PROGRAMMING_EXERCISE",
      ] as const;
      for (let i = 0; i < names.length; i++) {
        const materialId = id(30 + i);
        await tx.material.create({
          data: {
            id: materialId,
            lectureId: id(i < 4 ? 20 : 21),
            title: names[i],
            type: types[i],
            position: i < 4 ? i + 1 : i - 3,
            isVisible: true,
            isRequired: true,
          },
        });
        if (i === 0 || i === 6)
          await tx.programmingExercise.create({
            data: {
              materialId,
              externalKey: `mixed-code-${i}`,
              difficulty: "EASY",
              description: "<p>Print hello.</p>",
              starterCode: 'print("hello")',
              solutionCode: 'print("hello")',
              inputFormat: "",
              outputFormat: "",
              constraints: "",
            },
          });
        if (i === 1)
          await tx.pdfDocument.create({
            data: { materialId, assetId: pdf.id, placement: "MAIN" },
          });
        if (i === 2)
          await tx.manualMaterial.create({
            data: {
              materialId,
              description: "<p>Draw the circle.</p>",
              runtimeVersion: turtle.runtimeVersion,
              files: {
                "main.py":
                  'import turtle\nturtle.pencolor("red")\nturtle.circle(50)\nturtle.done()',
              },
              width: 640,
              height: 480,
              timeLimitSeconds: 60,
            },
          });
        if (i === 3)
          await tx.manualMaterial.create({
            data: {
              materialId,
              files: {},
              shortAnswer: {
                version: 1,
                question: "What is six times seven?",
                gradingMode: "EXACT",
                expectedAnswer: "42",
                pattern: "",
                explanationEnabled: false,
                explanation: "",
              },
              includeInScore: true,
            },
          });
        if (i === 4)
          await tx.manualMaterial.create({
            data: {
              materialId,
              files: {},
              multipleChoice: {
                version: 1,
                question: "<p>Choose the even number.</p>",
                selectionMode: "SINGLE",
                options: [
                  { id: id(101), content: "<p>2</p>" },
                  { id: id(102), content: "<p>3</p>" },
                ],
                correctOptionIds: [id(101)],
                shuffleOptions: false,
                explanationEnabled: false,
                explanation: "",
              },
              includeInScore: true,
            },
          });
        if (i === 5)
          await tx.videoLesson.create({
            data: {
              materialId,
              assetId: video.id,
              requestKey: randomUUID(),
              placement: "MAIN",
              includeInScore: false,
            },
          });
      }
      await tx.material.create({
        data: {
          id: id(37),
          lectureId: id(20),
          title: "Mixed PDF resource",
          type: "PDF_DOCUMENT",
          position: 5,
          isVisible: true,
          pdfDocument: {
            create: { assetId: pdf.id, placement: "SUPPLEMENTARY" },
          },
        },
      });
      await tx.material.create({
        data: {
          id: id(38),
          lectureId: id(21),
          title: "Mixed video resource",
          type: "VIDEO_LESSON",
          position: 4,
          isVisible: true,
          videoLesson: {
            create: {
              assetId: video.id,
              requestKey: randomUUID(),
              placement: "SUPPLEMENTARY",
            },
          },
        },
      });
    },
    { timeout: 30000 },
  );
  await db.classCourse.upsert({
    where: { classId_courseId: { classId, courseId: id(1) } },
    create: { classId, courseId: id(1), assignedByUserId: author.id },
    update: {},
  });
  console.log(
    "Mixed development course ready: code, PDF, turtle, short answer, choice, video, code; two supplementary resources.",
  );
} finally {
  await db.$disconnect();
}
