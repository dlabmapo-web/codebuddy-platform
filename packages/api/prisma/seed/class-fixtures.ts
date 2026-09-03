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
    /**
     * Email of the teacher put in charge of the class. Resolved to an active
     * teacher membership in this academy — never to a user id, because the
     * assignment is what carries the academy scope and the academy role.
     */
    teacherEmail?: string;
    /**
     * Emails of the teachers who assist the class beside its homeroom teacher.
     * Resolved the same way, and capped by the service rather than here — a
     * fixture that asks for four is a fixture bug worth seeing.
     */
    assistantTeacherEmails?: readonly string[];
  },
): Promise<{
  enrolled: number;
  teacherAssigned: boolean;
  assistantsAssigned: number;
}> {
  const teacherMembership = fixture.teacherEmail
    ? await findTeacherMembership(
        prisma,
        fixture.academyId,
        fixture.teacherEmail,
      )
    : null;

  if (fixture.teacherEmail && !teacherMembership) {
    throw new Error(
      `Class fixture teacher ${fixture.teacherEmail} is not an active teacher of academy ${fixture.academyId}`,
    );
  }

  const assistantMemberships = [];
  for (const email of fixture.assistantTeacherEmails ?? []) {
    const membership = await findTeacherMembership(
      prisma,
      fixture.academyId,
      email,
    );
    if (!membership) {
      throw new Error(
        `Class fixture assistant ${email} is not an active teacher of academy ${fixture.academyId}`,
      );
    }
    // The same person cannot hold both seats, and the API refuses it — so a
    // fixture asking for it should fail here rather than seed a state the app
    // would never let a manager create.
    if (membership.id === teacherMembership?.id) {
      throw new Error(
        `Class fixture assistant ${email} is already the homeroom teacher of class ${fixture.classId}`,
      );
    }
    assistantMemberships.push(membership);
  }

  await prisma.class.upsert({
    where: { id: fixture.classId },
    create: {
      id: fixture.classId,
      academyId: fixture.academyId,
      name: fixture.name,
      description: fixture.description,
      status: "ACTIVE",
      createdByUserId: fixture.createdByUserId,
      teacherMembershipId: teacherMembership?.id ?? null,
    },
    // A rerun restores an archived fixture, so a manual archive during testing
    // never leaves the automated journey without access. A rerun also restores
    // the assignment, so a test that removes the teacher stays repeatable.
    update: {
      name: fixture.name,
      status: "ACTIVE",
      archivedAt: null,
      teacherMembershipId: teacherMembership?.id ?? null,
    },
  });

  // Replaced rather than added to, for the same reason the class assignment is
  // restored above: a rerun has to put the fixture back exactly, including
  // after a test removed an assistant by hand.
  await prisma.classAssistantTeacher.deleteMany({
    where: {
      classId: fixture.classId,
      membershipId: {
        notIn: assistantMemberships.map((membership) => membership.id),
      },
    },
  });
  await prisma.classAssistantTeacher.createMany({
    data: assistantMemberships.map((membership) => ({
      classId: fixture.classId,
      membershipId: membership.id,
    })),
    skipDuplicates: true,
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

  return {
    enrolled: memberships.length,
    teacherAssigned: teacherMembership !== null,
    assistantsAssigned: assistantMemberships.length,
  };
}

/**
 * An active teacher of this academy, by email.
 *
 * Asks the role *set*: a director who also teaches stores `role = MANAGER`
 * with TEACHER beside it, and matching the primary role alone made them
 * unusable as a fixture teacher even though the app would accept them.
 */
async function findTeacherMembership(
  prisma: PrismaClient,
  academyId: string,
  email: string,
): Promise<{ id: string } | null> {
  return prisma.academyMembership.findFirst({
    where: {
      academyId,
      OR: [{ role: "TEACHER" }, { extraRoles: { some: { role: "TEACHER" } } }],
      status: "ACTIVE",
      user: { email, status: "ACTIVE" },
    },
    select: { id: true },
  });
}
