import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Video E2E fixture is development-only");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  databaseUrl.hostname !== "db.lnrmxjxsjxymgphgatwn.supabase.co" &&
  decodeURIComponent(databaseUrl.username) !== "postgres.lnrmxjxsjxymgphgatwn"
)
  throw new Error(
    "Video E2E database must be the development project",
  );
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const academyId = "20000000-0000-4000-8000-000000000001";
const courseId = "ee050000-0000-4000-8000-000000000001";
const moduleId = "ee050000-0000-4000-8000-000000000010";
const lectureId = "ee050000-0000-4000-8000-000000000020";
try {
  const author = await prisma.user.findUniqueOrThrow({
    where: { username: "cove-teamlead" },
  });
  await prisma.course.upsert({
    where: { id: courseId },
    create: {
      id: courseId,
      academyId,
      title: "E2E Video Materials",
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
      externalKey: "video-e2e-chapter",
      title: "Video Chapter",
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
      externalKey: "video-e2e-" + lectureId,
      title: "Video Lecture",
      position: 1,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.lecture.upsert({
    where: { id: "ee050000-0000-4000-8000-000000000021" },
    create: {
      id: "ee050000-0000-4000-8000-000000000021",
      courseModuleId: moduleId,
      externalKey: "video-e2e-resource",
      title: "Resource Only Lecture",
      position: 2,
      isVisible: true,
    },
    update: { isVisible: true },
  });
  await prisma.videoProcessingJob.updateMany({where:{asset:{courseId},status:{in:["PENDING","RUNNING"]}},data:{status:"CANCELLED",leaseId:null}});
  await prisma.videoAsset.updateMany({where:{courseId,state:{in:["UPLOADING","VERIFYING","PROCESSING","FAILED"]}},data:{state:"CANCELLED"}});
  const scope = { material: { lecture: { courseModule: { courseId } } } };
  await prisma.videoWatchProgress.deleteMany({where:scope});
  await prisma.manualReview.deleteMany({ where: { submission: scope } });
  await prisma.manualSubmission.deleteMany({ where: scope });
  await prisma.material.deleteMany({
    where: {
      type: {
        in: [
          "MULTIPLE_CHOICE",
          "VIDEO_LESSON",
          "TURTLE_EXERCISE",
          "WRITTEN_RESPONSE",
          "PDF_DOCUMENT",
        ],
      },
      lecture: { courseModule: { courseId } },
    },
  });
  const materialId = "ee050000-0000-4000-8000-000000000030";
  await prisma.material.upsert({
    where: { id: materialId },
    create: {
      id: materialId,
      lectureId,
      title: "Exercise after Video",
      type: "PROGRAMMING_EXERCISE",
      position: 1,
      isVisible: true,
      isRequired: true,
      programmingExercise: {
        create: {
          externalKey: "video-e2e-exercise",
          difficulty: "EASY",
          description: "<p>Print hello.</p>",
          starterCode: 'print("hello")',
          solutionCode: 'print("hello")',
          solutions: { create: [{ position: 0, title: null, code: 'print("hello")' }] },
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
  console.log("Development Video E2E course ready.");
} finally {
  await prisma.$disconnect();
}
