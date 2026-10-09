import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Development fixture only");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  databaseUrl.hostname !== "db.lnrmxjxsjxymgphgatwn.supabase.co" &&
  decodeURIComponent(databaseUrl.username) !== "postgres.lnrmxjxsjxymgphgatwn"
)
  throw new Error("Storage checks require the development database");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  const [access] = await db.$queryRaw<
    Array<{ protected: boolean }>
  >`SELECT relrowsecurity AND NOT has_table_privilege('authenticated','public.multiple_choice_assessments','SELECT') AND NOT has_table_privilege('anon','public.multiple_choice_assessments','SELECT') AS protected FROM pg_class WHERE oid='public.multiple_choice_assessments'::regclass`;
  if (!access?.protected)
    throw new Error("Private assessment table is not protected");
  const row = await db.multipleChoiceAssessment.findFirstOrThrow({
    where: {
      submission: {
        material: {
          lecture: {
            courseModule: { courseId: "ee040000-0000-4000-8000-000000000001" },
          },
        },
      },
    },
  });
  for (const data of [
    { definition: { question: "Forbidden rewrite" } },
    { selectedOptionIds: [] },
    { scoreHundredths: 1 },
  ]) {
    let blocked = false;
    try {
      await db.$transaction(async (tx) => {
        try {
          await tx.multipleChoiceAssessment.update({
            where: { submissionId: row.submissionId },
            data,
          });
        } catch (e) {
          blocked =
            e instanceof Error &&
            e.message.includes("snapshots and results are immutable");
          throw e;
        }
        throw new Error("Missing guard; rolling back");
      });
    } catch {
      if (!blocked) throw new Error("Choice immutability guard failed");
    }
  }
  let exclusive = false;
  try {
    await db.$transaction(async (tx) => {
      try {
        await tx.shortAnswerAssessment.create({
          data: {
            submissionId: row.submissionId,
            definition: {},
            status: "MANUAL",
          },
        });
      } catch (e) {
        exclusive =
          e instanceof Error && e.message.includes("mutually exclusive");
        throw e;
      }
      throw new Error("Missing guard; rolling back");
    });
  } catch {
    if (!exclusive) throw new Error("Assessment exclusivity guard failed");
  }
  console.log(
    "Private access, immutable snapshots/results and exclusive assessment kinds verified.",
  );
} finally {
  await db.$disconnect();
}
