import { exerciseSolutionsSchema, type ExerciseSolutionEntry } from "@cove/shared";
import type { Prisma } from "../generated/prisma/client.js";

/** Shared canonical validation and first-entry projection, including bulk copies. */
export function prepareExerciseSolutions(materialId: string, input: ExerciseSolutionEntry[]) {
  const solutions = exerciseSolutionsSchema.parse(input);
  return {
    solutionCode: solutions[0]?.code ?? null,
    rows: solutions.map(({ title, code }, position) => ({ materialId, position, title, code })),
  };
}

/** Callers own the transaction and parent lock. */
export async function replaceExerciseSolutions(tx: Prisma.TransactionClient, materialId: string, solutions: ExerciseSolutionEntry[]) {
  const prepared = prepareExerciseSolutions(materialId, solutions);
  await tx.programmingExerciseSolution.deleteMany({ where: { materialId } });
  if (prepared.rows.length) await tx.programmingExerciseSolution.createMany({ data: prepared.rows });
  await tx.programmingExercise.update({ where: { materialId }, data: { solutionCode: prepared.solutionCode } });
}

export const solutionOrder = { orderBy: { position: "asc" as const } };
export function privateSolutions(entries: { title: string | null; code: string }[]): ExerciseSolutionEntry[] {
  return entries.map(({ title, code }) => ({ title, code }));
}
