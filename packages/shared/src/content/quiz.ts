import { z } from "zod";

export const quizChoiceSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  text: z.string().trim().min(1).max(4000),
});
/** Student projection deliberately cannot carry an answer or explanation. */
export const publicQuizSchema = z.object({
  choices: z.array(quizChoiceSchema).min(2).max(10),
});
export const quizDefinitionSchema = publicQuizSchema
  .extend({
    correctChoiceId: z.string().min(1).max(80),
    explanation: z.string().max(10000),
  })
  .superRefine((quiz, ctx) => {
    if (new Set(quiz.choices.map((c) => c.id)).size !== quiz.choices.length) {
      ctx.addIssue({
        code: "custom",
        path: ["choices"],
        message: "Choice IDs must be unique.",
      });
    }
    if (!quiz.choices.some((c) => c.id === quiz.correctChoiceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["correctChoiceId"],
        message: "Select one correct choice.",
      });
    }
  });
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
export const quizSnapshotSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  description: z.string(),
  definition: quizDefinitionSchema,
});
export const quizFeedbackSchema = z.object({
  title: z.string(),
  description: z.string(),
  choices: z.array(quizChoiceSchema),
  selectedChoiceId: z.string(),
  correctChoiceId: z.string(),
  explanation: z.string(),
});
export function publicQuiz(value: unknown) {
  if (value == null) return null;
  const quiz = quizDefinitionSchema.parse(value);
  return publicQuizSchema.parse(quiz);
}
export function quizFeedback(
  snapshot: unknown,
  answer: string,
  status: string,
) {
  if (snapshot == null || (status !== "PASSED" && status !== "FAILED"))
    return null;
  const { title, description, definition } = quizSnapshotSchema.parse(snapshot);
  return { title, description, ...definition, selectedChoiceId: answer };
}

/** JSONB key order and explanation edits do not invalidate earned progress. */
export function sameQuizGrading(left: unknown, right: unknown): boolean {
  if (left == null || right == null) return left == null && right == null;
  const a = quizDefinitionSchema.parse(left);
  const b = quizDefinitionSchema.parse(right);
  return (
    a.correctChoiceId === b.correctChoiceId &&
    a.choices.length === b.choices.length &&
    a.choices.every(
      (choice, index) =>
        choice.id === b.choices[index]?.id &&
        choice.text === b.choices[index]?.text,
    )
  );
}
