import { z } from "zod";

export const choiceOptionSchema = z
  .object({ id: z.uuid(), content: z.string().max(10000) })
  .strict();
// Public shape deliberately has no answer key or explanation content.
export const publicChoiceSchema = z.object({
  version: z.literal(1).default(1),
  question: z.string().trim().min(1).max(1000),
  problemDescription: z.string().max(100000).default(""),
  selectionMode: z.enum(["SINGLE", "MULTIPLE"]),
  options: z.array(choiceOptionSchema).min(2).max(20),
  shuffleOptions: z.boolean().default(false),
  explanationEnabled: z.boolean().default(false),
});
export const meaningfulChoiceHtml = (html: string) =>
  Boolean(
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;|&#160;|&#x[aA]0;/g, " ")
      .trim() || /<img\b/i.test(html),
  );
export const multipleChoiceSchema = publicChoiceSchema
  .extend({
    correctOptionIds: z.array(z.uuid()).min(1).max(20),
    explanation: z.string().max(100000).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.options.map((o) => o.id);
    if (
      new Set(ids).size !== ids.length ||
      value.options.some((o) => !meaningfulChoiceHtml(o.content))
    )
      ctx.addIssue({
        code: "custom",
        message: "Options must have unique IDs and meaningful content",
      });
    if (
      new Set(value.correctOptionIds).size !== value.correctOptionIds.length ||
      value.correctOptionIds.some((id) => !ids.includes(id)) ||
      (value.selectionMode === "SINGLE" && value.correctOptionIds.length !== 1)
    )
      ctx.addIssue({
        code: "custom",
        message: "Select a valid correct answer key",
      });
    if (value.explanationEnabled && !meaningfulChoiceHtml(value.explanation))
      ctx.addIssue({ code: "custom", message: "Enter an explanation" });
  });
export type MultipleChoiceDefinition = z.infer<typeof multipleChoiceSchema>;
export type PublicChoiceDefinition = z.infer<typeof publicChoiceSchema>;
export const choiceSelectionSchema = z
  .object({
    selectedOptionIds: z.array(z.uuid()).min(1).max(20),
    displayOrder: z.array(z.uuid()).min(2).max(20),
  })
  .strict();
export function evaluateMultipleChoice(
  definition: MultipleChoiceDefinition,
  selection: z.infer<typeof choiceSelectionSchema>,
) {
  const ids = new Set(definition.options.map((o) => o.id));
  if (
    selection.displayOrder.length !== ids.size ||
    new Set(selection.displayOrder).size !== ids.size ||
    selection.displayOrder.some((id) => !ids.has(id)) ||
    new Set(selection.selectedOptionIds).size !==
      selection.selectedOptionIds.length ||
    selection.selectedOptionIds.some((id) => !ids.has(id)) ||
    (definition.selectionMode === "SINGLE" &&
      selection.selectedOptionIds.length !== 1) ||
    !selection.selectedOptionIds.length
  )
    throw new Error("Invalid choice selection or displayed order");
  return (
    selection.selectedOptionIds.length === definition.correctOptionIds.length &&
    selection.selectedOptionIds.every((id) =>
      definition.correctOptionIds.includes(id),
    )
  );
}
export function publicChoice(
  definition: MultipleChoiceDefinition,
): PublicChoiceDefinition {
  return publicChoiceSchema.parse(definition);
}
