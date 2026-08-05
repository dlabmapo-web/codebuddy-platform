import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * The live monitoring fixture: one academy inside the rollout, one class whose
 * assignment is actually effective, one enrolled student with a draft, and one
 * stored feedback message.
 *
 * Every precondition is asserted rather than created. A seed that quietly
 * assigned a suspended teacher, or enrolled nobody, would produce a fixture
 * that looks right and monitors nothing — and the failure would surface as a
 * confusing empty page in a browser test rather than here.
 */

/** Fixed ids keep the seed rerunnable instead of stacking near-duplicates. */
export const monitoringFixture = {
  draftId: "e0000000-0000-4000-8000-000000000050",
  feedbackId: "e0000000-0000-4000-8000-000000000051",
  feedbackKey: "e0000000-0000-4000-8000-000000000052",
  draftCode: "a = int(input())\nb = int(input())\nprint(a + b)\n",
  feedbackBody: "Read both numbers before adding them.",
} as const;

export async function seedMonitoringFixture(
  prisma: PrismaClient,
  fixture: {
    academyId: string;
    classId: string;
    /** The exercise the fixture student is left mid-solution on. */
    materialId: string;
  },
): Promise<{ teacherMembershipId: string; studentMembershipId: string }> {
  await prisma.academyFeatureFlag.upsert({
    where: {
      academyId_feature: {
        academyId: fixture.academyId,
        feature: "TEACHER_LIVE_MONITORING",
      },
    },
    create: {
      academyId: fixture.academyId,
      feature: "TEACHER_LIVE_MONITORING",
      isEnabled: true,
    },
    update: { isEnabled: true },
  });

  // The whole effective-assignment predicate, expressed the way the API
  // expresses it. If this finds nothing, monitoring would be denied at runtime
  // and the fixture is not usable.
  const classRecord = await prisma.class.findFirst({
    where: {
      id: fixture.classId,
      academyId: fixture.academyId,
      status: "ACTIVE",
      assignedTeacher: {
        academyId: fixture.academyId,
        role: "TEACHER",
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
      courseAssignments: { some: {} },
    },
    select: { id: true, teacherMembershipId: true },
  });
  if (!classRecord?.teacherMembershipId) {
    throw new Error(
      `Monitoring fixture: class ${fixture.classId} has no effective assigned teacher, active status, and assigned course.`,
    );
  }

  const enrollment = await prisma.classEnrollment.findFirst({
    where: {
      classId: fixture.classId,
      membership: {
        academyId: fixture.academyId,
        role: "STUDENT",
        status: "ACTIVE",
        user: { status: "ACTIVE" },
      },
    },
    select: { membershipId: true, membership: { select: { userId: true } } },
    orderBy: [{ enrolledAt: "asc" }, { membershipId: "asc" }],
  });
  if (!enrollment) {
    throw new Error(
      `Monitoring fixture: class ${fixture.classId} has no active enrolled student.`,
    );
  }

  // Reachable through this class, not merely visible somewhere: the teacher's
  // view is scoped to what their own class is taught.
  const material = await prisma.material.findFirst({
    where: {
      id: fixture.materialId,
      isVisible: true,
      programmingExercise: { isNot: null },
      lecture: {
        isVisible: true,
        courseModule: {
          isVisible: true,
          course: {
            academyId: fixture.academyId,
            isVisible: true,
            classAssignments: { some: { classId: fixture.classId } },
          },
        },
      },
    },
    select: {
      id: true,
      lecture: { select: { courseModule: { select: { courseId: true } } } },
    },
  });
  if (!material) {
    throw new Error(
      `Monitoring fixture: material ${fixture.materialId} is not a visible exercise this class is taught.`,
    );
  }

  // A draft, so the teacher opens a workspace with work in it rather than
  // starter code. The collaboration document is deliberately not created here:
  // it is built lazily from this draft on the first live edit.
  await prisma.exerciseDraft.upsert({
    where: {
      userId_materialId: {
        userId: enrollment.membership.userId,
        materialId: material.id,
      },
    },
    create: {
      id: monitoringFixture.draftId,
      userId: enrollment.membership.userId,
      materialId: material.id,
      sourceMaterialId: material.id,
      courseId: material.lecture.courseModule.courseId,
      code: monitoringFixture.draftCode,
    },
    update: { code: monitoringFixture.draftCode },
  });

  // One representative message, keyed the way the live command keys it, so a
  // rerun updates the same row rather than growing the history.
  await prisma.teacherFeedback.upsert({
    where: {
      teacherMembershipRef_idempotencyKey: {
        teacherMembershipRef: classRecord.teacherMembershipId,
        idempotencyKey: monitoringFixture.feedbackKey,
      },
    },
    create: {
      id: monitoringFixture.feedbackId,
      academyId: fixture.academyId,
      classId: fixture.classId,
      teacherMembershipId: classRecord.teacherMembershipId,
      studentMembershipId: enrollment.membershipId,
      teacherMembershipRef: classRecord.teacherMembershipId,
      studentMembershipRef: enrollment.membershipId,
      materialId: material.id,
      idempotencyKey: monitoringFixture.feedbackKey,
      body: monitoringFixture.feedbackBody,
    },
    update: { body: monitoringFixture.feedbackBody },
  });

  return {
    teacherMembershipId: classRecord.teacherMembershipId,
    studentMembershipId: enrollment.membershipId,
  };
}
