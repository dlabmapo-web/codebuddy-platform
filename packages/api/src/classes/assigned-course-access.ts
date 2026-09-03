import { holdsRoleWhere } from "../authorization/membership-roles.js";
import { taughtByWhere } from "./assigned-class-access.js";
import type { AcademyRole } from "@cove/shared";

import type { Prisma } from "../generated/prisma/client.js";

/**
 * The one predicate that decides whether a student may reach a course.
 *
 * Every student read — the catalog, an outline, a workspace, a draft, a
 * submission — composes this rather than restating the relationship chain.
 * A near-copy in one endpoint is how a remembered direct URL turns into an
 * access hole, so there is exactly one definition of the chain here.
 *
 * Access needs an active enrollment in an active class of this academy whose
 * membership is still an active `STUDENT`, plus a course assignment to that
 * class. Curriculum visibility is a separate, additional gate: see
 * `learn/curriculum-visibility.ts`. Two classes granting the same course is a
 * duplicate path, not a duplicate course — `some` collapses it either way.
 */
export function assignedCourseWhere(
  academyId: string,
  userId: string,
): Prisma.CourseWhereInput {
  return {
    academyId,
    classAssignments: {
      some: { class: enrolledClassWhere(academyId, userId) },
    },
  };
}

/**
 * The first half of that chain on its own: a class this student currently
 * learns through.
 *
 * Both the class and the membership are pinned to the requested academy, so a
 * class id or a membership from somewhere else cannot satisfy the relation —
 * the join is the check, not a step before one. The student class pages select
 * on this directly; `assignedCourseWhere` composes it rather than restating
 * it, which is what keeps "a class I am in" from meaning two things.
 */
export function enrolledClassWhere(
  academyId: string,
  userId: string,
): Prisma.ClassWhereInput {
  return {
    academyId,
    status: "ACTIVE",
    enrollments: {
      some: {
        membership: { academyId, userId, status: "ACTIVE", role: "STUDENT" },
      },
    },
  };
}

/**
 * The same policy expressed from a material, for the endpoints a student can
 * reach by direct URL without naming a course.
 */
export function assignedMaterialWhere(
  academyId: string,
  userId: string,
): Prisma.MaterialWhereInput {
  return {
    lecture: {
      courseModule: { course: assignedCourseWhere(academyId, userId) },
    },
  };
}

/**
 * A class this teacher currently runs, as its homeroom teacher or as one of
 * its assistants.
 *
 * The mirror of `enrolledClassWhere` for the other side of delivery. The
 * assignment stores a membership rather than a user, so the academy and the
 * `TEACHER` role are both pinned here: a membership key alone cannot prove
 * same-academy, and a demoted teacher must stop reaching the class through it.
 */
export function taughtClassWhere(
  academyId: string,
  userId: string,
): Prisma.ClassWhereInput {
  return {
    academyId,
    status: "ACTIVE",
    ...taughtByWhere({
      academyId,
      userId,
      status: "ACTIVE",
      ...holdsRoleWhere("TEACHER"),
    }),
  };
}

/** A course delivered by a class this teacher runs. */
export function taughtCourseWhere(
  academyId: string,
  userId: string,
): Prisma.CourseWhereInput {
  return {
    academyId,
    classAssignments: { some: { class: taughtClassWhere(academyId, userId) } },
  };
}

/** The same policy expressed from a material. */
export function taughtMaterialWhere(
  academyId: string,
  userId: string,
): Prisma.MaterialWhereInput {
  return {
    lecture: {
      courseModule: { course: taughtCourseWhere(academyId, userId) },
    },
  };
}

/**
 * What one actor may reach through the learning surface.
 *
 * Class assignment gates delivery to students, and the teaching assignment
 * gates it for teachers: a teacher sees the courses their own classes are
 * given, not everything the academy owns. A Team Lead or Manager runs the
 * curriculum for the whole academy, so their scope stays the plain academy —
 * neither should have to enroll in a class to reach a course they own.
 */
export type LearningScope = {
  course: Prisma.CourseWhereInput;
  material: Prisma.MaterialWhereInput;
};

export function learningScopeFor(
  academyId: string,
  actor: { userId: string; role: AcademyRole },
): LearningScope {
  if (actor.role === "STUDENT") {
    return {
      course: assignedCourseWhere(academyId, actor.userId),
      material: assignedMaterialWhere(academyId, actor.userId),
    };
  }
  if (actor.role === "TEACHER") {
    return {
      course: taughtCourseWhere(academyId, actor.userId),
      material: taughtMaterialWhere(academyId, actor.userId),
    };
  }
  return { course: { academyId }, material: {} };
}
