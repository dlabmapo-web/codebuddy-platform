import { describe, expect, it } from "vitest";

import { createProgrammingExerciseSchema } from "./course.js";

const validExercise = {
  academyId: "20000000-0000-4000-8000-000000000001",
  courseId: "40000000-0000-4000-8000-000000000001",
  versionId: "50000000-0000-4000-8000-000000000001",
  lectureId: "90000000-0000-4000-8000-000000000001",
  title: "Sum two numbers",
  difficulty: "EASY" as const,
  description: "<p>Add two integers.</p>",
  inputFormat: "",
  outputFormat: "",
  constraints: "",
  starterCode: "",
  aiFeedbackEnabled: false,
  testCases: [{
    input: "1 2",
    expectedOutput: "3",
    visibility: "SAMPLE" as const,
  }],
  hints: [],
};

describe("manual programming exercise schemas", () => {
  it("accepts the v1 manual authoring fields", () => {
    expect(createProgrammingExerciseSchema.safeParse(validExercise).success)
      .toBe(true);
  });

  it("rejects browser-controlled execution limits", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      timeLimitMs: 60_000,
      memoryLimitMb: 4_096,
    });

    expect(result.success).toBe(false);
  });
});
