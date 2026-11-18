import { exerciseSolutionsSchema, type ExerciseSolutionEntry } from "@cove/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { fingerprint, resolveItemKeys } from "./item-keys.js";

/**
 * Shared canonical validation and first-entry projection, including bulk copies.
 * Entries that carry a `syncKey` keep it (a library copy carries its master's).
 */
export function prepareExerciseSolutions(materialId: string, input: ExerciseSolutionEntry[]) {
  const solutions = exerciseSolutionsSchema.parse(input);
  return {
    solutionCode: solutions[0]?.code ?? null,
    rows: solutions.map(({ title, code, syncKey }, position) => ({
      materialId,
      position,
      title,
      code,
      ...(syncKey ? { syncKey } : {}),
    })),
  };
}

/**
 * Callers own the transaction and parent lock. `existing` is the solutions as
 * stored before this save, so identities survive the replace (item-keys.ts).
 */
export async function replaceExerciseSolutions(
  tx: Prisma.TransactionClient,
  materialId: string,
  solutions: ExerciseSolutionEntry[],
  existing: ReadonlyArray<{ syncKey: string; title: string | null; code: string }> = [],
) {
  const keys = resolveItemKeys(
    existing.map((item) => ({ syncKey: item.syncKey, fingerprint: fingerprint({ title: item.title, code: item.code }) })),
    solutions.map((item) => ({ syncKey: item.syncKey, fingerprint: fingerprint({ title: item.title ?? null, code: item.code }) })),
  );
  const prepared = prepareExerciseSolutions(
    materialId,
    solutions.map((item, index) => ({ ...item, syncKey: keys[index] })),
  );
  await tx.programmingExerciseSolution.deleteMany({ where: { materialId } });
  if (prepared.rows.length) await tx.programmingExerciseSolution.createMany({ data: prepared.rows });
  await tx.programmingExercise.update({ where: { materialId }, data: { solutionCode: prepared.solutionCode } });
}

export const solutionOrder = { orderBy: { position: "asc" as const } };
export function privateSolutions(
  entries: { title: string | null; code: string; syncKey?: string }[],
): ExerciseSolutionEntry[] {
  return entries.map(({ title, code, syncKey }) => ({ title, code, ...(syncKey ? { syncKey } : {}) }));
}
