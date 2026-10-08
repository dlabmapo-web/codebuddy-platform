import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Short-answer E2E fixture is development-only");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const academyId = "20000000-0000-4000-8000-000000000001";
const courseId = "ee030000-0000-4000-8000-000000000001";
const moduleId = "ee030000-0000-4000-8000-000000000010";
const lectureId = "ee030000-0000-4000-8000-000000000020";
try {
  const author = await prisma.user.findUniqueOrThrow({
    where: { username: "cove-teamlead" },
  });
  await prisma.course.upsert({
    where: { id: courseId },
    create: {
      id: courseId,
      academyId,
      title: "E2E Short-answer Materials",
      createdByUserId: author.id,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.courseModule.upsert({
    where: { id: moduleId },
    create: {
      id: moduleId,
      courseId,
      externalKey: "short-answer-e2e-chapter",
      title: "Short-answer Chapter",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.lecture.upsert({
    where: { id: lectureId },
    create: {
      id: lectureId,
      courseModuleId: moduleId,
      externalKey: "short-answer-e2e-" + lectureId,
      title: "Short-answer Lecture",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.lecture.upsert({
    where: { id: "ee030000-0000-4000-8000-000000000021" },
    create: {
      id: "ee030000-0000-4000-8000-000000000021",
      courseModuleId: moduleId,
      externalKey: "short-answer-e2e-resource",
      title: "Resource Only Lecture",
      position: 2,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  const scope = { material: { lecture: { courseModule: { courseId } } } };
  await prisma.manualReview.deleteMany({ where: { submission: scope } });
  await prisma.manualSubmission.deleteMany({ where: scope });
  await prisma.material.deleteMany({
    where: {
      type: { in: ["TURTLE_EXERCISE", "WRITTEN_RESPONSE", "PDF_DOCUMENT"] },
      lecture: { courseModule: { courseId } },
    },
  });
  const materialId = "ee030000-0000-4000-8000-000000000030";
  await prisma.material.upsert({
    where: { id: materialId },
    create: {
      id: materialId,
      lectureId,
      title: "Exercise after Short-answer",
      type: "PROGRAMMING_EXERCISE",
      position: 1,
      isVisible: true,
      isRequired: true,
      programmingExercise: {
        create: {
          externalKey: "short-answer-e2e-exercise",
          difficulty: "EASY",
          description: "<p>Print hello.</p>",
          starterCode: 'print("hello")',
          solutionCode: 'print("hello")',
          inputFormat: "",
          outputFormat: "",
          constraints: "",
        },
      },
    },
    update: { isVisible: true },
  });
  const classId = "e0000000-0000-4000-8000-000000000040";
  await prisma.classCourse.upsert({
    where: { classId_courseId: { classId, courseId } },
    create: { classId, courseId, assignedByUserId: author.id },
    update: {},
  });
  console.log("Development Short-answer E2E course ready.");
} finally {
  await prisma.$disconnect();
}
