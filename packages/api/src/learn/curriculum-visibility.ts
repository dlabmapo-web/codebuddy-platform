import type { LearningScope } from "../classes/assigned-course-access.js";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * One effective-visibility predicate for every student operation that targets
 * a problem directly. Keeping the complete ancestor chain here prevents a new
 * draft/run/submission endpoint from accidentally checking only the problem.
 */
export function effectivelyVisibleMaterialWhere(
  academyId: string,
): Prisma.MaterialWhereInput {
  return {
    isVisible: true,
    programmingExercise: { isNot: null },
    lecture: {
      isVisible: true,
      courseModule: {
        isVisible: true,
        course: { academyId, isVisible: true },
      },
    },
  };
}

/**
 * Both gates at once: the curriculum must be effectively visible *and* the
 * actor's class assignments must reach it. Every student operation that
 * targets a problem directly composes this, so a new endpoint cannot ship
 * with only half the policy.
 */
export function reachableMaterialWhere(
  academyId: string,
  scope: LearningScope,
): Prisma.MaterialWhereInput {
  return {
    AND: [effectivelyVisibleMaterialWhere(academyId), scope.material],
  };
}
