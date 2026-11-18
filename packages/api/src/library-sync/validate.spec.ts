import { describe, expect, it } from "vitest";

import { big } from "./canonical.js";
import { materialUnits } from "./catalog.js";
import type {
  ProjectedExercise,
  ProjectedManual,
  ProjectedMaterial,
} from "./projection.js";
import { validateMaterial } from "./validate.js";

/**
 * Additions and merges both go through the editors' rules (design §8.3);
 * only the documented older forms (catalog §5.1) are accepted as they are.
 */
const context = { pdfAvailable: () => true };
const keys = {
  referenceKey: (id: string | null) => id,
  optionKey: (id: string) => id,
};

function exercise(
  overrides: Partial<ProjectedExercise> = {},
): ProjectedMaterial {
  return {
    id: "m1",
    type: "PROGRAMMING_EXERCISE",
    title: "Sum",
    position: 1,
    isRequired: false,
    isVisible: true,
    explanation: null,
    video: null,
    pdf: null,
    manual: null,
    exercise: {
      externalKey: "p1",
      difficulty: "EASY",
      description: big("<p>Add.</p>"),
      inputFormat: "",
      outputFormat: "",
      constraints: "",
      starterCode: big(""),
      language: "PYTHON",
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      totalTimeLimitMs: null,
      comparatorTimeLimitMs: null,
      gradingMode: "LEGACY_STDIO",
      inputPromptPolicy: "INCLUDE",
      continuationPolicy: "STOP_ON_FIRST_FAILURE",
      exitStatusPolicy: "IGNORE",
      materialMaximumHundredths: null,
      materialScorePolicy: null,
      gradingSemanticVersion: "legacy-v1",
      submissionPolicy: "AUTOMATIC",
      manualMaximumHundredths: 10000,
      manualIncludeInScore: false,
      feedbackPolicy: null,
      aiFeedbackEnabled: false,
      quiz: null,
      referencePdfMaterialId: null,
      gradingRevision: 1,
      testCases: [
        {
          syncKey: "c1",
          position: 1,
          input: big("1 2"),
          expectedOutput: big("3"),
          visibility: "SAMPLE",
          comparator: "STDOUT",
          weight: 1,
          timeLimitMsOverride: null,
          softTimeLimitMs: null,
          softPenalty: null,
          label: null,
        },
      ],
      hints: [],
      solutions: [
        { syncKey: "s1", position: 0, title: "Main", code: big("print(3)") },
      ],
      ...overrides,
    },
  } as ProjectedMaterial;
}

function turtle(files: Record<string, string>): ProjectedMaterial {
  const manual: ProjectedManual = {
    description: big(""),
    files: Object.fromEntries(
      Object.entries(files).map(([path, code]) => [path, big(code)]),
    ),
    entryPoint: "main.py",
    assets: [],
    modelAnswer: "",
    solutionAssets: [],
    solutionFiles: null,
    hint: "",
    width: 1024,
    height: 640,
    timeLimitSeconds: 1800,
    memoryLimitMb: 512,
    runtimeVersion: "v1",
    submitEnabled: true,
    includeInScore: false,
    maximumHundredths: 10000,
    multipleChoice: null,
    shortAnswer: null,
    revision: 1,
  };
  return {
    id: "t1",
    type: "TURTLE_EXERCISE",
    title: "Square",
    position: 1,
    isRequired: false,
    isVisible: true,
    explanation: null,
    video: null,
    pdf: null,
    exercise: null,
    manual,
  };
}

const units = (material: ProjectedMaterial) => materialUnits(material, keys);
const add = (material: ProjectedMaterial) =>
  validateMaterial(material.type, units(material), context, null);

describe("validateMaterial", () => {
  it("accepts a valid addition", () => {
    expect(add(exercise())).toBeNull();
  });

  it("accepts the documented older forms as they are, without changing them", () => {
    expect(add(exercise({ solutions: [] }))).toBeNull();
    expect(add(exercise({ testCases: [] }))).toBeNull();
  });

  it("does not widen an older form: an unanswered practice problem is still checked for everything else", () => {
    // No answer is supported; a C problem that is not weighted is not.
    expect(add(exercise({ solutions: [], language: "C" }))).toMatch(
      /weighted grading/,
    );
  });

  it("rejects an addition the editor would refuse", () => {
    const files = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`f${index}.py`, "pass\n"]),
    );
    expect(add(turtle({ "main.py": "import turtle\n", ...files }))).toMatch(
      /64 files/,
    );
    expect(add(turtle({ "notes.txt": "x" }))).toMatch(/entry point/);
    expect(
      add(
        exercise({
          hints: [
            {
              syncKey: "h1",
              position: 1,
              content: "  ",
              triggerExpression: null,
            },
          ],
        }),
      ),
    ).not.toBeNull();
  });

  it("counts against a merge only what the copy did not already have", () => {
    const before = units(turtle({ "notes.txt": "x" }));
    // The copy already lacked an entry point: a merge that keeps that is not refused for it.
    expect(
      validateMaterial(
        "TURTLE_EXERCISE",
        { ...before, "material.title": "Renamed" },
        context,
        before,
      ),
    ).toBeNull();
    // A merge that breaks something new is.
    const files = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [
        `manual.file:f${index}.py`,
        big("pass\n"),
      ]),
    );
    expect(
      validateMaterial(
        "TURTLE_EXERCISE",
        { ...before, ...files },
        context,
        before,
      ),
    ).toMatch(/64 files/);
  });
});
