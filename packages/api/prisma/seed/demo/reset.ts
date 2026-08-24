import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { validateEnvironment } from "../../../src/config/env.schema.js";
import { PrismaClient } from "../../../src/generated/prisma/client.js";
import { preservedEmails } from "./dataset.js";

/**
 * Clears every academy, class, course, and piece of student work, keeping only
 * the real people who own their own accounts.
 *
 * Deletion is written out in dependency order rather than left to cascades.
 * Several relations are deliberately `Restrict` — a course may not vanish
 * because its author's account was removed — so a cascade-only reset stops
 * halfway with a foreign-key error and leaves the database in a state that is
 * neither the old one nor the new one. The order below is the schema's own
 * ordering read backwards.
 */

const platformOrganizationSlug = "cove";

/** Only ever true for accounts this repository's own seeds created. */
function isDisposableEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (preservedEmails.some((kept) => kept.toLowerCase() === normalized)) {
    return false;
  }
  return (
    normalized.endsWith("@cove.test") ||
    normalized.endsWith("@dlab.test") ||
    normalized.startsWith("e2e.")
  );
}

export async function resetDemoDatabase(
  prisma: PrismaClient,
  supabase: SupabaseClient,
): Promise<void> {
  const kept = await prisma.user.findMany({
    where: { email: { in: [...preservedEmails] } },
    select: { id: true, email: true },
  });
  const keptIds = kept.map((user) => user.id);
  console.log(`   preserving ${kept.length} account(s): ${kept.map((u) => u.email).join(", ")}`);

  // Student work, newest layer first.
  await prisma.learningActivityFlush.deleteMany();
  await prisma.studentCourseLearningDay.deleteMany();
  // The ledger before the balance projected from it, and both before the
  // memberships they hang off.
  await prisma.pointAward.deleteMany();
  await prisma.studentPointBalance.deleteMany();
  await prisma.teacherFeedback.deleteMany();
  await prisma.teacherMonitoringVisit.deleteMany();
  await prisma.exerciseCollaborationDocument.deleteMany();
  await prisma.exerciseDraft.deleteMany();
  await prisma.submissionCase.deleteMany();
  await prisma.submissionGradingCase.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.exerciseSolveSession.deleteMany();
  await prisma.studentExerciseProgress.deleteMany();

  // Curriculum.
  await prisma.exerciseTestCase.deleteMany();
  await prisma.exerciseHint.deleteMany();
  await prisma.programmingExercise.deleteMany();
  await prisma.material.deleteMany();
  await prisma.lecture.deleteMany();
  await prisma.courseModule.deleteMany();

  // Delivery.
  await prisma.classCourse.deleteMany();
  await prisma.classScheduleSlot.deleteMany();
  await prisma.classEnrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.course.deleteMany();

  // People operations.
  await prisma.invitationDeliveryAttempt.deleteMany();
  await prisma.academyInvitation.deleteMany();
  await prisma.academyJoinRequest.deleteMany();
  await prisma.oAuthOnboardingIntent.deleteMany();
  await prisma.peopleImportSession.deleteMany();
  await prisma.peopleBulkOperation.deleteMany();
  await prisma.academyMedia.deleteMany();
  await prisma.academyFeatureFlag.deleteMany();

  // Membership and its three profile shapes.
  await prisma.academyMemberProfile.deleteMany();
  await prisma.studentAcademyProfile.deleteMany();
  await prisma.staffAcademyProfile.deleteMany();
  await prisma.academyMembership.deleteMany();

  await prisma.auditLog.deleteMany();
  await prisma.academy.deleteMany();

  // Before users: `MediaAsset.uploader` is Restrict, so an account that ever
  // uploaded a photo cannot be removed while the row survives.
  await prisma.mediaAsset.deleteMany();

  const removable = await prisma.user.findMany({
    where: { id: { notIn: keptIds } },
    select: { id: true, email: true, authUserId: true },
  });
  await prisma.user.deleteMany({ where: { id: { notIn: keptIds } } });
  console.log(`   deleted ${removable.length} Cove user row(s)`);

  await prisma.organization.deleteMany({
    where: { slug: { not: platformOrganizationSlug } },
  });

  // Supabase Auth is a separate system: a deleted Cove row leaves a sign-in
  // identity behind, and that identity would later `bootstrap` itself a brand
  // new empty account. Only seed-owned addresses are removed — a real person's
  // identity is never touched, even when their Cove row was not preserved.
  let deletedIdentities = 0;
  for (const user of removable) {
    if (!user.authUserId || !user.email || !isDisposableEmail(user.email)) continue;
    const { error } = await supabase.auth.admin.deleteUser(user.authUserId);
    if (error) {
      console.warn(`   ! could not delete auth identity ${user.email}: ${error.message}`);
      continue;
    }
    deletedIdentities += 1;
  }
  console.log(`   deleted ${deletedIdentities} Supabase Auth identity/identities`);
}

async function main(): Promise<void> {
  const environment = validateEnvironment(process.env);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }),
  });
  const supabase = createClient(
    environment.SUPABASE_URL,
    environment.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    console.log("🧹 Resetting demo database...");
    await resetDemoDatabase(prisma, supabase);
    console.log("✅ Reset complete.");
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run directly, so `demo.ts` can import the function without the
// reset firing twice.
if (process.argv[1]?.endsWith("reset.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : "Reset failed.");
    process.exitCode = 1;
  });
}
