import { describe, expect, it } from "vitest";

import {
  courseHasNoVisibleContent,
  createCourseSchema,
  hasSampleTestCase,
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

  /**
   * Answers are what make a problem *gradeable*, not what make it *writable*.
   * Requiring one to save meant an author with the question but not yet the
   * answer could not put the question down at all. The half-written state is
   * already a first-class one everywhere else: a submission to such a problem
   * is refused with `EXERCISE_NOT_AVAILABLE`, and the console counts them as
   * `problemsWithoutTests`.
   */
  it("accepts an exercise with no answers yet", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: [],
    });

    expect(result.success).toBe(true);
  });

  it("accepts an exercise whose cases are all hidden from students", () => {
    const result = createProgrammingExerciseSchema.safeParse({
      ...validExercise,
      testCases: [
        { input: "1 2", expectedOutput: "3", visibility: "HIDDEN" as const },
      ],
    });

    expect(result.success).toBe(true);
  });

  /** Still reported to the author — it is just no longer a refusal. */
  it("reports whether a student would be shown a worked example", () => {
    expect(
      hasSampleTestCase([
        { expectedOutput: "3", visibility: "SAMPLE" as const },
      ]),
    ).toBe(true);
    expect(
      hasSampleTestCase([
        { expectedOutput: "  ", visibility: "SAMPLE" as const },
      ]),
    ).toBe(false);
    expect(
      hasSampleTestCase([
        { expectedOutput: "3", visibility: "HIDDEN" as const },
      ]),
    ).toBe(false);
    expect(hasSampleTestCase([])).toBe(false);
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

/**
 * The one predicate three surfaces read — the builder strip, the courses table
 * chip and the class panel note. If they ever disagreed about what "not
 * teachable" means, the warning would appear in one place and not another,
 * which is worse than no warning at all.
 */
describe("courseHasNoVisibleContent", () => {
  const course = (isVisible: boolean, visibleExercises: number) => ({
    isVisible,
    content: { visibleExercises },
  });

  it("stays quiet about a hidden course with hidden content", () => {
    expect(courseHasNoVisibleContent(course(false, 0))).toBe(false);
  });

  it("warns about a published course that can deliver nothing", () => {
    expect(courseHasNoVisibleContent(course(true, 0))).toBe(true);
  });

  it("stops warning once one problem is reachable", () => {
    expect(courseHasNoVisibleContent(course(true, 1))).toBe(false);
  });

  it("stays quiet about a hidden course that is fully stocked", () => {
    expect(courseHasNoVisibleContent(course(false, 12))).toBe(false);
  });
});
