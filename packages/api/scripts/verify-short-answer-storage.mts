import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Development fixture only");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const scope = {
  material: {
    lecture: {
      courseModule: { courseId: "ee030000-0000-4000-8000-000000000001" },
    },
  },
};
async function denied(
  submissionId: string,
  data: { definition?: Prisma.InputJsonValue; status?: string },
  message: string,
) {
  let blocked = false;
  try {
    await db.$transaction(async (tx) => {
      try {
        await tx.shortAnswerAssessment.update({
          where: { submissionId },
          data,
        });
      } catch (error) {
        blocked = error instanceof Error && error.message.includes(message);
        throw error;
      }
      // Even a missing guard must not leave altered test data behind.
      throw new Error("Expected database rejection; rolling back");
    });
  } catch {
    if (!blocked) throw new Error("Assessment storage guard failed");
  }
}
try {
  const [access] = await db.$queryRaw<
    Array<{ protected: boolean }>
  >`SELECT relrowsecurity AND NOT has_table_privilege('authenticated','public.short_answer_assessments','SELECT') AND NOT has_table_privilege('anon','public.short_answer_assessments','SELECT') AS protected FROM pg_class WHERE oid='public.short_answer_assessments'::regclass`;
  if (!access?.protected)
    throw new Error("Private assessment table access is not protected");
  const attempt = await db.shortAnswerAssessment.findFirst({
    where: { submission: scope },
    select: { submissionId: true },
  });
  const graded = await db.shortAnswerAssessment.findFirst({
    where: { submission: scope, status: "GRADED" },
    select: { submissionId: true },
  });
  if (!attempt || !graded)
    throw new Error("Run short-answer E2E fixtures before this verification");
  await denied(
    attempt.submissionId,
    { definition: { question: "Forbidden rewrite" } },
    "snapshots are immutable",
  );
  await denied(
    graded.submissionId,
    { status: "ERROR" },
    "automatic results are terminal",
  );
  console.log(
    "Private access, immutable definitions and terminal automatic results verified.",
  );
} finally {
  await db.$disconnect();
}
