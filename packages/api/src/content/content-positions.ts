import type { Prisma } from "../generated/prisma/client.js";

/**
 * Where a module, lecture, or material sits, and how that is safely changed.
 *
 * Extracted from `CourseService` rather than reimplemented in the importer,
 * because §7.2 requires manual and imported content to share one set of
 * invariants. Positions are the place that matters most: they carry a unique
 * constraint per parent, so any code that assigns them has to work around the
 * fact that the intermediate states of a reorder are illegal. A second
 * implementation of that dance would be a second chance to get it wrong, and
 * the symptom is a constraint violation that rolls back somebody's import.
 */

export async function nextModulePosition(
  tx: Prisma.TransactionClient,
  courseId: string,
) {
  const result = await tx.courseModule.aggregate({
    where: { courseId },
    _max: { position: true },
  });
  return (result._max.position ?? 0) + 1;
}

export async function nextLecturePosition(
  tx: Prisma.TransactionClient,
  moduleId: string,
) {
  const result = await tx.lecture.aggregate({
    where: { courseModuleId: moduleId },
    _max: { position: true },
  });
  return (result._max.position ?? 0) + 1;
}

export async function nextMaterialPosition(
  tx: Prisma.TransactionClient,
  lectureId: string,
) {
  const result = await tx.material.aggregate({
    where: { lectureId },
    _max: { position: true },
  });
  return (result._max.position ?? 0) + 1;
}

export async function compactModulePositions(
  tx: Prisma.TransactionClient,
  courseId: string,
) {
  const records = await tx.courseModule.findMany({
    where: { courseId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await rewritePositions(tx, "module", records.map((record) => record.id));
}

export async function compactLecturePositions(
  tx: Prisma.TransactionClient,
  moduleId: string,
) {
  const records = await tx.lecture.findMany({
    where: { courseModuleId: moduleId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await rewritePositions(tx, "lecture", records.map((record) => record.id));
}

export async function compactMaterialPositions(
  tx: Prisma.TransactionClient,
  lectureId: string,
) {
  const records = await tx.material.findMany({
    where: { lectureId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await rewritePositions(tx, "material", records.map((record) => record.id));
}

/**
 * Assign `1..n` in the given order, in two passes.
 *
 * The unique constraint on `(parent, position)` makes the obvious single-pass
 * version fail: moving the third item to first collides with the item already
 * there. Every record is first parked above the current maximum, which no other
 * row can be occupying, and only then given its final place.
 */
export async function rewritePositions(
  tx: Prisma.TransactionClient,
  kind: "module" | "lecture" | "material",
  ids: string[],
) {
  if (ids.length === 0) return;
  const currentMax =
    kind === "module"
      ? await tx.courseModule.aggregate({
          where: { id: { in: ids } },
          _max: { position: true },
        })
      : kind === "lecture"
        ? await tx.lecture.aggregate({
            where: { id: { in: ids } },
            _max: { position: true },
          })
        : await tx.material.aggregate({
            where: { id: { in: ids } },
            _max: { position: true },
          });
  const temporaryStart = (currentMax._max.position ?? 0) + ids.length + 1;
  for (const [index, id] of ids.entries()) {
    // Positions have positive CHECK constraints, so move records above the
    // current range before assigning the final contiguous order.
    const data = { position: temporaryStart + index };
    if (kind === "module") await tx.courseModule.update({ where: { id }, data });
    if (kind === "lecture") await tx.lecture.update({ where: { id }, data });
    if (kind === "material") await tx.material.update({ where: { id }, data });
  }
  for (const [index, id] of ids.entries()) {
    const data = { position: index + 1 };
    if (kind === "module") await tx.courseModule.update({ where: { id }, data });
    if (kind === "lecture") await tx.lecture.update({ where: { id }, data });
    if (kind === "material") await tx.material.update({ where: { id }, data });
  }
}

/**
 * Merge explicit workbook positions with siblings whose order was left blank.
 *
 * Blank existing entities keep their relative order, blank new entities have
 * already been appended by the writer, and explicit positions are inserted in
 * ascending order. Positions past the end mean append, matching the importer's
 * historical behavior before the final dense `1..n` rewrite.
 */
export function mergePreferredPositions(
  currentIds: readonly string[],
  preferred: readonly { id: string; position: number | null }[],
): string[] {
  const explicit = preferred
    .filter(
      (entry): entry is { id: string; position: number } =>
        entry.position !== null,
    )
    .map((entry, index) => ({ ...entry, index }))
    .sort(
      (left, right) =>
        left.position - right.position || left.index - right.index,
    );
  const explicitIds = new Set(explicit.map((entry) => entry.id));
  const ordered = currentIds.filter((id) => !explicitIds.has(id));

  for (const entry of explicit) {
    const targetIndex = Math.min(entry.position - 1, ordered.length);
    ordered.splice(targetIndex, 0, entry.id);
  }
  return ordered;
}

/**
 * §9.2 — one course content mutation, recorded on the course.
 *
 * Called in the same transaction as the change it describes, by every path that
 * touches a course, module, lecture, material, exercise, test, hint, order, or
 * visibility. An import preview captures this number and the commit requires it
 * to still be current, which is what makes "somebody edited the course while
 * you were reviewing" a refusal rather than a silent overwrite.
 */
export async function bumpContentRevision(
  tx: Prisma.TransactionClient,
  courseId: string,
): Promise<number> {
  const course = await tx.course.update({
    where: { id: courseId },
    data: { contentRevision: { increment: 1 } },
    select: { contentRevision: true },
  });
  return course.contentRevision;
}
