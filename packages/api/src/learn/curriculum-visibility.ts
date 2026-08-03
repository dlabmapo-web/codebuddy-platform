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
