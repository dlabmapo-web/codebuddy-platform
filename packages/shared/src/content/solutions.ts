import { z } from "zod";

export const exerciseSolutionEntrySchema = z.object({
  title: z.string().trim().max(80).nullable().transform(value => value || null),
  code: z.string().max(100_000).refine(value => value.trim().length > 0, "A correct answer is required."),
}).strict();
export const exerciseSolutionsSchema = z.array(exerciseSolutionEntrySchema).max(10)
  .refine(entries => entries.reduce((total, entry) => total + entry.code.length, 0) <= 500_000,
    "Combined solution code exceeds 500,000 characters.");
export type ExerciseSolutionEntry = z.infer<typeof exerciseSolutionEntrySchema>;
