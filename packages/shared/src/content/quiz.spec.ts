import { describe, expect, it } from "vitest";
import {
  sameQuizGrading,
  publicQuiz,
  quizDefinitionSchema,
  quizFeedback,
} from "./quiz.js";
const definition = {
  choices: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctChoiceId: "b",
  explanation: "SECRET EXPLANATION",
};
describe("single-answer quizzes", () => {
  it("strips the answer key and explanation from the learner projection", () => {
    expect(publicQuiz(definition)).toEqual({ choices: definition.choices });
  });
  it("requires distinct choices and one existing correct choice", () => {
    expect(
      quizDefinitionSchema.safeParse({
        ...definition,
        correctChoiceId: "missing",
      }).success,
    ).toBe(false);
    expect(
      quizDefinitionSchema.safeParse({
        ...definition,
        choices: [definition.choices[0], definition.choices[0]],
      }).success,
    ).toBe(false);
    expect(
      quizDefinitionSchema.safeParse({
        ...definition,
        choices: [{ id: "a", text: " " }, definition.choices[1]],
      }).success,
    ).toBe(false);
  });
  it("discloses feedback only after a real graded verdict", () => {
    const snapshot = {
      version: 1,
      title: "Original",
      description: "Question",
      definition,
    };
    for (const status of ["QUEUED", "RUNNING", "ERRORED", "CANCELLED"])
      expect(quizFeedback(snapshot, "a", status)).toBeNull();
    expect(quizFeedback(snapshot, "a", "FAILED")).toMatchObject({
      title: "Original",
      selectedChoiceId: "a",
      correctChoiceId: "b",
    });
  });
});

it("preserves progress when JSONB reorders keys or only the explanation changes", () => {
  expect(
    sameQuizGrading(definition, {
      explanation: "Revised explanation",
      correctChoiceId: "b",
      choices: definition.choices.map(({ id, text }) => ({ text, id })),
    }),
  ).toBe(true);
  expect(
    sameQuizGrading(definition, { ...definition, correctChoiceId: "a" }),
  ).toBe(false);
});
