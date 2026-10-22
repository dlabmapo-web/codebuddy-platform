import { academyTeachingRoles, roleCanTeachAcademy, roleCanMonitor, type AcademyRole } from "@cove/shared";

import { holdsRoleWhere } from "../authorization/membership-roles.js";
import { HttpStatus } from "@nestjs/common";
import type { AppErrorCode } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";
import { effectivelyVisibleMaterialWhere } from "../learn/curriculum-visibility.js";

/** Shared class scope for monitoring, Solution status and student analytics.
 * Managers and Team Leads cover active classes in their own academy; Teachers
 * need a homeroom or assistant assignment. Queries recheck the relevant grant.
 */

export type AssignedClassActor = {
  userId: string;
  academyId: string;
  /** The teacher's own membership, which is what a class assignment stores.
   *  Empty for a platform operator, who has none — see `scope`. */
  membershipId: string;
  /**
   * Which classes this actor's teaching surfaces cover.
   *
   * `assigned` is a Teacher's actual teaching assignments.
   * `academy-staff` is an active Manager/Team Lead's academy, including live work.
   * `academy` is a platform operator standing in the Teacher role, who has no
   * membership to be named on — "what does a teacher see here" cannot mean one
   * teacher's classes when the person asking is not one of them, so it means
   * the academy's.
   *
   * Defaulted at every existing call site, so a teacher's reach is unchanged
   * and widening it stays a thing a caller has to ask for by name.
   */
  scope?: 'assigned' | 'academy' | 'academy-staff';
};

/** Resolve a current teaching actor. Managers and Team Leads have academy-wide scope;
 * Teachers need an actual class assignment.
 * Surface-specific denial codes avoid disclosing foreign class identifiers.
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
  resolveActor: () => Promise<{
    userId: string;
    role: string;
    roles: readonly AcademyRole[];
    via?: "membership" | "support" | "platform";
  }>;
  academyId: string;
  deniedCode: AppErrorCode;
}): Promise<AssignedClassActor> {
  let actor: {
    userId: string;
    role: string;
    roles: readonly AcademyRole[];
    via?: "membership" | "support" | "platform";
  };
  try {
    actor = await input.resolveActor();
  } catch (error) {
    if (error instanceof AppException) {
      throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
    }
    throw error;
  }
  // Manager and Team Lead access does not require a separate Teacher grant.
  if (!actor.roles.some(roleCanMonitor)) {
    throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
  }
  const membership = await input.prisma.academyMembership.findUnique({
    where: {
      academyId_userId: { academyId: input.academyId, userId: actor.userId },
    },
    select: { id: true },
  });

  if (!membership) {
    // Somebody standing in the Teacher role who is not a member of this
    // academy — a platform operator, or an operator inside a support session.
    // Neither holds a membership for a class to be assigned to, so the refusal
    // below would make the Teacher view permanently empty. Their scope is the
    // academy's classes instead.
    if (actor.via === "platform" || actor.via === "support") {
      return {
        userId: actor.userId,
        academyId: input.academyId,
        membershipId: "",
        scope: "academy",
      };
    }
    throw new AppException(input.deniedCode, HttpStatus.FORBIDDEN);
  }

  return {
    userId: actor.userId,
    academyId: input.academyId,
    membershipId: membership.id,
    ...(actor.roles.some(roleCanTeachAcademy) && actor.via !== "platform" && actor.via !== "support"
      ? { scope: "academy-staff" as const } : {}),
  };
}

/**
 * "A class taught by a membership matching this predicate" — homeroom teacher
 * or assistant.
 *
 * Who teaches a class is two rows in two tables: the homeroom column names the
 * one person answerable for it, and `assistantTeachers` holds everyone else
 * who teaches it on identical terms. Composed rather than spelled out at each
 * call site, because a caller that remembered only the homeroom column would
 * go on refusing assistants long after this one was fixed.
 *
 * The membership predicate is applied to both sides, so an assistant who has
 * been suspended or moved off `TEACHER` loses the class exactly as the
 * homeroom teacher does.
 */
export function taughtByWhere(
  teacher: Prisma.AcademyMembershipWhereInput,
): Prisma.ClassWhereInput {
  return {
    OR: [{ assignedTeacher: teacher }, { assistantTeachers: { some: { teacher } } }],
  };
}

export function assignedClassWhere(
  actor: AssignedClassActor,
): Prisma.ClassWhereInput {
  const base = { academyId: actor.academyId, status: "ACTIVE" } as const;
  // A platform operator has no membership for a class to be assigned to, so
  // the assignment joins below would select nothing at all. Their Teacher view
  // covers the academy's active classes instead.
  if (actor.scope === "academy") return base;
  if (actor.scope === "academy-staff") return academyTeachingClassWhere(actor);

  return {
    academyId: actor.academyId,
    status: "ACTIVE",
    // Pinned by membership id inside the join rather than by the class's
    // teacher column, so the one predicate covers both places a teacher can
    // sit on a class.
    ...taughtByWhere({
      id: actor.membershipId,
      academyId: actor.academyId,
      userId: actor.userId,
      ...holdsRoleWhere("TEACHER"),
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    }),
  };
}

/** ORM counterpart to the shared academy-wide teaching-role policy. */
export function academyTeachingRoleWhere(): Prisma.AcademyMembershipWhereInput {
  return { OR: academyTeachingRoles.map(role => holdsRoleWhere(role)) };
}

/** Rechecks academy-wide teaching authority inside the class query, including on long-lived sockets. */
export function academyTeachingClassWhere(actor: {
  academyId: string; userId: string; membershipId?: string;
}): Prisma.ClassWhereInput {
  return {
    academyId: actor.academyId,
    status: "ACTIVE",
    academy: {
      status: "ACTIVE",
      memberships: { some: {
        ...(actor.membershipId ? { id: actor.membershipId } : {}),
        academyId: actor.academyId, userId: actor.userId,
        status: "ACTIVE", user: { status: "ACTIVE" }, ...academyTeachingRoleWhere(),
      } },
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
