import { HttpStatus } from "@nestjs/common";
import type { AppErrorCode } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
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

/**
 * The acting teacher, or a refusal — once, for every teacher-facing read.
 *
 * `classes.assigned.manage` alone is not enough: Team Leads hold it for other
 * operational reasons. The explicit `TEACHER` conjunction is what stops a
 * future change to the role map from quietly handing one class's student
 * history to another role.
 *
 * The denial code is a parameter because each surface answers with its own,
 * and every surface uses one code for every failure — not assigned, archived,
 * wrong academy, suspended membership, no such class — so a caller cannot map
 * another academy by reading which error came back.
 */
export async function requireAssignedTeacherActor(input: {
  prisma: {
    academyMembership: {
      findUnique: (args: {
        where: { academyId_userId: { academyId: string; userId: string } };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  };
  resolveActor: () => Promise<{ userId: string; role: string }>;
  academyId: string;
  deniedCode: AppErrorCode;
}): Promise<AssignedClassActor> {
  let actor: { userId: string; role: string };
  try {
    actor = await input.resolveActor();
  } catch (error) {
    if (error instanceof AppException) {
      throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
    }
    throw error;
  }
  if (actor.role !== "TEACHER") {
    throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
  }
  const membership = await input.prisma.academyMembership.findUnique({
    where: {
      academyId_userId: { academyId: input.academyId, userId: actor.userId },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
  }
  return {
    userId: actor.userId,
    academyId: input.academyId,
    membershipId: membership.id,
  };
}

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

/**
 * An active student membership of this academy, enrolled in these classes.
 *
 * Takes one class or several so the academy overview's `class=all` union and a
 * single class's roster are the same predicate. A separate "across my classes"
 * version is exactly how one of the two would later forget to check that the
 * membership is still ACTIVE.
 */
export function classStudentWhere(
  academyId: string,
  classId: string | string[],
): Prisma.AcademyMembershipWhereInput {
  return {
    academyId,
    role: "STUDENT",
    status: "ACTIVE",
    user: { status: "ACTIVE" },
    classEnrollments: {
      some: {
        classId: Array.isArray(classId) ? { in: classId } : classId,
      },
    },
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
  classId: string | string[],
): Prisma.MaterialWhereInput {
  return {
    AND: [
      effectivelyVisibleMaterialWhere(academyId),
      {
        lecture: {
          courseModule: {
            course: {
              classAssignments: {
                some: {
                  classId: Array.isArray(classId) ? { in: classId } : classId,
                },
              },
            },
          },
        },
      },
    ],
  };
}
