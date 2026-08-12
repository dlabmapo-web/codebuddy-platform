import type { Prisma } from "../generated/prisma/client.js";
import { effectivelyVisibleMaterialWhere } from "../learn/curriculum-visibility.js";

/**
 * What "a class this teacher is responsible for" means, once.
 *
 * Live monitoring and Solution status are different features with different
 * data, but they answer this question identically, and two near-copies of an
 * authorization predicate is how one of them quietly keeps granting access
 * after the other is fixed. Both compose these.
 *
 * The joins are the check. A class in another academy, an archived one, one
 * assigned to somebody else, or one whose assigned membership has been
 * suspended or demoted is not merely rejected — it is never selected.
 */

export type AssignedClassActor = {
  userId: string;
  academyId: string;
  /** The teacher's own membership, which is what a class assignment stores. */
  membershipId: string;
};

export function assignedClassWhere(
  actor: AssignedClassActor,
): Prisma.ClassWhereInput {
  return {
    academyId: actor.academyId,
    status: "ACTIVE",
    teacherMembershipId: actor.membershipId,
    assignedTeacher: {
      academyId: actor.academyId,
      userId: actor.userId,
      role: "TEACHER",
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    },
  };
}

/** An active student membership of this academy, enrolled in this class. */
export function classStudentWhere(
  academyId: string,
  classId: string,
): Prisma.AcademyMembershipWhereInput {
  return {
    academyId,
    role: "STUDENT",
    status: "ACTIVE",
    user: { status: "ACTIVE" },
    classEnrollments: { some: { classId } },
  };
}

/**
 * Effectively visible curriculum that this class is actually taught.
 *
 * Deliberately narrower than a student's own reachability, which spans every
 * class they sit in: a student enrolled in two classes must not expose one
 * class's work to the other class's teacher. Removing the course from the
 * class removes the teacher's view of it in the same step.
 */
export function classTaughtMaterialWhere(
  academyId: string,
  classId: string,
): Prisma.MaterialWhereInput {
  return {
    AND: [
      effectivelyVisibleMaterialWhere(academyId),
      {
        lecture: {
          courseModule: {
            course: { classAssignments: { some: { classId } } },
          },
        },
      },
    ],
  };
}
