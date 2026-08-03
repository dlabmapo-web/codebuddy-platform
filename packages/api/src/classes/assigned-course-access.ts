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
      some: {
        class: {
          academyId,
          status: "ACTIVE",
          enrollments: {
            some: {
              membership: {
                academyId,
                userId,
                status: "ACTIVE",
                role: "STUDENT",
              },
            },
          },
        },
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
 * What one actor may reach through the learning surface.
 *
 * Class assignment gates delivery to students. Staff previewing their own
 * curriculum are governed by their staff permissions and the visibility rules
 * alone — a Team Lead should not have to enroll in a class to walk the course
 * they wrote — so their scope stays the plain academy.
 */
export type LearningScope = {
  course: Prisma.CourseWhereInput;
  material: Prisma.MaterialWhereInput;
};

export function learningScopeFor(
  academyId: string,
  actor: { userId: string; role: AcademyRole },
): LearningScope {
  if (actor.role !== "STUDENT") {
    return { course: { academyId }, material: {} };
  }
  return {
    course: assignedCourseWhere(academyId, actor.userId),
    material: assignedMaterialWhere(academyId, actor.userId),
  };
}
