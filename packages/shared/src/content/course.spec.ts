import { describe, expect, it } from "vitest";

import {
  createCourseSchema,
  createProgrammingExerciseSchema,
  programmingExerciseDescriptionMaxLength,
  programmingExerciseSchema,
} from "./course.js";

const validExercise = {
  academyId: "20000000-0000-4000-8000-000000000001",
  courseId: "40000000-0000-4000-8000-000000000001",
  lectureId: "90000000-0000-4000-8000-000000000001",
  title: "Sum two numbers",
  difficulty: "EASY" as const,
  description: "<p>Add two integers.</p>",
  inputFormat: "",
  outputFormat: "",
  constraints: "",
  starterCode: "",
  solutionCode: "a, b = map(int, input().split())\nprint(a + b)\n",
  aiFeedbackEnabled: false,
  isVisible: true,
  testCases: [{
    input: "1 2",
    expectedOutput: "3",
    visibility: "SAMPLE" as const,
  }],
  hints: [],
};

describe("manual programming exercise schemas", () => {
  it("accepts the manual authoring fields with a correct answer", () => {
    expect(createProgrammingExerciseSchema.safeParse(validExercise).success)
      .toBe(true);
  });

  it("requires a nonblank correct answer without trimming valid code", () => {
    expect(createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      solutionCode: "  \n",
    }).success).toBe(false);
  });

  it("accepts large lesson-style exercise descriptions for reads and writes", () => {
    const description = "x".repeat(100_001);

    expect(createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      description,
    }).success).toBe(true);
    expect(
      programmingExerciseSchema.shape.description.safeParse(description)
        .success,
    ).toBe(true);
  });

  it("keeps exercise descriptions bounded", () => {
    const description = "x".repeat(
      programmingExerciseDescriptionMaxLength + 1,
    );

    expect(createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      description,
    }).success).toBe(false);
    expect(
      programmingExerciseSchema.shape.description.safeParse(description)
        .success,
    ).toBe(false);
  });

  it("does not widen ordinary course descriptions", () => {
    expect(createCourseSchema.safeParse({
      academyId: validExercise.academyId,
      title: "A course",
      description: "x".repeat(10_001),
    }).success).toBe(false);
  });

  it("rejects browser-controlled execution limits", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      timeLimitMs: 60_000,
      memoryLimitMb: 4_096,
    });

    expect(result.success).toBe(false);
  });

  it("accepts author-chosen visibility in any order", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: [
        { input: "1 2", expectedOutput: "3", visibility: "HIDDEN" as const },
        { input: "4 5", expectedOutput: "9", visibility: "SAMPLE" as const },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects an exercise whose cases are all hidden from students", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: [
        { input: "1 2", expectedOutput: "3", visibility: "HIDDEN" as const },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a sample case with no expected output to show", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: [
        { input: "1 2", expectedOutput: "  ", visibility: "SAMPLE" as const },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects more than fifty test cases", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: Array.from({ length: 51 }, () => ({
        input: "1 2",
        expectedOutput: "3",
        visibility: "SAMPLE" as const,
      })),
    });

    expect(result.success).toBe(false);
  });
});
