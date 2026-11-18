import {
  manualAssetsSchema,
  multipleChoiceSchema,
  shortAnswerSchema,
  videoCaptionSchema,
} from "@cove/shared";
import { describe, expect, it } from "vitest";

import { Prisma } from "../generated/prisma/client.js";
import { JSON_COVERAGE, MODEL_COVERAGE } from "./catalog-coverage.js";

/**
 * The guard of merge unit catalog §6: a content column or JSON key nobody
 * decided about fails here, rather than being silently left out of sync.
 */
const scalarFields: Record<string, Record<string, string>> = {
  Course: Prisma.CourseScalarFieldEnum,
  CourseModule: Prisma.CourseModuleScalarFieldEnum,
  Lecture: Prisma.LectureScalarFieldEnum,
  Material: Prisma.MaterialScalarFieldEnum,
  ExplanationMaterial: Prisma.ExplanationMaterialScalarFieldEnum,
  VideoLesson: Prisma.VideoLessonScalarFieldEnum,
  PdfDocument: Prisma.PdfDocumentScalarFieldEnum,
  ProgrammingExercise: Prisma.ProgrammingExerciseScalarFieldEnum,
  ExerciseTestCase: Prisma.ExerciseTestCaseScalarFieldEnum,
  ExerciseHint: Prisma.ExerciseHintScalarFieldEnum,
  ProgrammingExerciseSolution:
    Prisma.ProgrammingExerciseSolutionScalarFieldEnum,
  ManualMaterial: Prisma.ManualMaterialScalarFieldEnum,
};

const shapeKeys = (schema: unknown): string[] => {
  let current = schema as {
    shape?: Record<string, unknown>;
    def?: { innerType?: unknown; element?: unknown; in?: unknown };
  };
  // Unwrap refinements, pipes and arrays down to the object.
  for (let depth = 0; depth < 6 && !current.shape; depth += 1)
    current = (current.def?.innerType ??
      current.def?.element ??
      current.def?.in ??
      current) as typeof current;
  return Object.keys(current.shape ?? {});
};

describe("library sync catalog coverage", () => {
  it.each(Object.keys(scalarFields))(
    "claims or excludes every column of %s",
    (model) => {
      const columns = Object.keys(scalarFields[model]!).sort();
      expect(Object.keys(MODEL_COVERAGE[model] ?? {}).sort()).toEqual(columns);
    },
  );

  it.each([
    ["multipleChoice", multipleChoiceSchema],
    ["shortAnswer", shortAnswerSchema],
    ["videoCaption", videoCaptionSchema],
    ["manualAsset", manualAssetsSchema],
  ] as const)("claims or excludes every key of %s", (name, schema) => {
    expect(Object.keys(JSON_COVERAGE[name]!).sort()).toEqual(
      shapeKeys(schema).sort(),
    );
  });
});
