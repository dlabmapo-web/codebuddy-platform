import { describe, it, expect } from "vitest";
import { shortAnswerSchema, effectiveManualResult } from "@cove/shared";
import { ShortAnswerEvaluator } from "./short-answer-evaluator.js";
const definition = (mode: "EXACT" | "REGEX", rule: string) =>
  shortAnswerSchema.parse({
    question: "Original question",
    gradingMode: mode,
    expectedAnswer: mode === "EXACT" ? rule : "",
    pattern: mode === "REGEX" ? rule : "",
  });
describe("short-answer matching", () => {
  const evaluator = new ShortAnswerEvaluator();
  it("preserves literal case, spaces, newlines, numbers and Unicode", async () => {
    for (const [expected, answer, result] of [
      ["orbit", "orbit", true],
      ["orbit", "ORBIT", false],
      ["orbit", " orbit", false],
      ["orbit", "orbit\n", false],
      ["1", "01", false],
      ["é", "e\u0301", false],
      ["안녕", "안녕", true],
    ] as const)
      expect(
        await evaluator.evaluate(definition("EXACT", expected), answer),
      ).toBe(result);
  });
  it("matches regex search, anchors, alternatives and escaped literals", async () => {
    for (const [pattern, answer, result] of [
      ["orbit", "orbital", true],
      ["^orbit$", "orbital", false],
      ["orbit", "ORBIT", false],
      ["^(red|blue)$", "blue", true],
      ["^a\\.b$", "a.b", true],
      ["^a\\.b$", "axb", false],
    ] as const)
      expect(
        await evaluator.evaluate(definition("REGEX", pattern), answer),
      ).toBe(result);
  });
  it("rejects malformed expressions and recovers after a bounded catastrophic match", async () => {
    await expect(
      evaluator.evaluate(definition("REGEX", "["), "x"),
    ).rejects.toThrow("Invalid regular expression");
    await expect(
      evaluator.evaluate(definition("REGEX", "(a+)+$"), "a".repeat(4000) + "!"),
    ).rejects.toThrow("timed out");
    expect(
      await evaluator.evaluate(definition("REGEX", "^safe$"), "safe"),
    ).toBe(true);
  });
  it("uses published teacher overrides ahead of automatic results", () => {
    const automatic = {
      status: "GRADED",
      completed: true,
      scoreHundredths: 10000,
    };
    expect(
      effectiveManualResult({ reviews: [], shortAnswerAssessment: automatic })
        ?.completed,
    ).toBe(true);
    expect(
      effectiveManualResult({
        reviews: [{ completed: false, scoreHundredths: 2500 }],
        shortAnswerAssessment: automatic,
      }),
    ).toEqual({ completed: false, scoreHundredths: 2500 });
    expect(
      effectiveManualResult({
        reviews: [],
        shortAnswerAssessment: { ...automatic, status: "ERROR" },
      }),
    ).toBeUndefined();
  });
});
