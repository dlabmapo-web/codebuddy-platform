import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * Classes are the only path from a course to a student, so a fixture course
 * that no class assigns is invisible to every seeded student. Each content
 * seed therefore builds its own class here rather than relying on migration
 * back-fill — nothing infers a class from academy membership.
 *
 * Fixed ids keep it rerunnable: a second run updates the same class instead of
 * stacking near-duplicates beside it.
 */
export async function seedClassFixture(
  prisma: PrismaClient,
  fixture: {
    classId: string;
    academyId: string;
    name: string;
    description: string;
    /** Who owns the class record. Any staff user of the academy will do. */
    createdByUserId: string;
    courseIds: readonly string[];
    /** Emails of the users to enroll, resolved to their academy membership. */
    studentEmails: readonly string[];
  },
): Promise<{ enrolled: number }> {
  await prisma.class.upsert({
    where: { id: fixture.classId },
    create: {
      id: fixture.classId,
      academyId: fixture.academyId,
      name: fixture.name,
      description: fixture.description,
      status: "ACTIVE",
      createdByUserId: fixture.createdByUserId,
    },
    // A rerun restores an archived fixture, so a manual archive during testing
    // never leaves the automated journey without access.
    update: { name: fixture.name, status: "ACTIVE", archivedAt: null },
  });

  await prisma.classCourse.createMany({
    data: fixture.courseIds.map((courseId) => ({
      classId: fixture.classId,
      courseId,
      assignedByUserId: fixture.createdByUserId,
    })),
    skipDuplicates: true,
  });

  const memberships = await prisma.academyMembership.findMany({
    where: {
      academyId: fixture.academyId,
      role: "STUDENT",
      status: "ACTIVE",
      user: { email: { in: [...fixture.studentEmails] } },
    },
    select: { id: true },
  });
  await prisma.classEnrollment.createMany({
    data: memberships.map((membership) => ({
      classId: fixture.classId,
      membershipId: membership.id,
      enrolledByUserId: fixture.createdByUserId,
    })),
    skipDuplicates: true,
  });

  return { enrolled: memberships.length };
}
