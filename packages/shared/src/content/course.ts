import { z } from "zod";

export const courseStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const courseStatusSchema = z.enum(courseStatuses);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseVersionStatuses = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export const courseVersionStatusSchema = z.enum(courseVersionStatuses);
export type CourseVersionStatus = z.infer<typeof courseVersionStatusSchema>;

export const materialTypes = ["PROGRAMMING_EXERCISE"] as const;
export const materialTypeSchema = z.enum(materialTypes);
export type MaterialType = z.infer<typeof materialTypeSchema>;

export const exerciseDifficulties = ["EASY", "MEDIUM", "HARD"] as const;
export const exerciseDifficultySchema = z.enum(exerciseDifficulties);
export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

export const exerciseLanguages = ["PYTHON"] as const;
export const exerciseLanguageSchema = z.enum(exerciseLanguages);
export type ExerciseLanguage = z.infer<typeof exerciseLanguageSchema>;

export const testCaseVisibilities = ["SAMPLE", "HIDDEN"] as const;
export const testCaseVisibilitySchema = z.enum(testCaseVisibilities);
export type TestCaseVisibility = z.infer<typeof testCaseVisibilitySchema>;

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().trim().max(10_000);
const positionSchema = z.number().int().positive();

export const courseVersionSummarySchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: courseVersionStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

/** What the curriculum currently holds, for the course list. */
export const courseContentCountsSchema = z.object({
  modules: z.number().int().nonnegative(),
  lectures: z.number().int().nonnegative(),
  exercises: z.number().int().nonnegative(),
});
export type CourseContentCounts = z.infer<typeof courseContentCountsSchema>;

export const courseSummarySchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  status: courseStatusSchema,
  draftVersion: courseVersionSummarySchema.nullable(),
  publishedVersion: courseVersionSummarySchema.nullable(),
  content: courseContentCountsSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const exerciseTestCaseSchema = z.object({
  id: z.uuid(),
  position: positionSchema,
  input: z.string(),
  expectedOutput: z.string(),
  visibility: testCaseVisibilitySchema,
});

export const exerciseHintSchema = z.object({
  id: z.uuid(),
  position: positionSchema,
  content: z.string().trim().min(1).max(10_000),
  triggerExpression: z.string().trim().max(2_000).nullable(),
});

export const programmingExerciseSchema = z.object({
  materialId: z.uuid(),
  externalKey: z.string().trim().min(1).max(200),
  legacyProblemNo: z.number().int().positive().nullable(),
  difficulty: exerciseDifficultySchema,
  description: descriptionSchema,
  inputFormat: z.string().max(10_000),
  outputFormat: z.string().max(10_000),
  constraints: z.string().max(10_000),
  starterCode: z.string().max(100_000),
  language: exerciseLanguageSchema,
  timeLimitMs: z.number().int().min(100).max(60_000),
  memoryLimitMb: z.number().int().min(16).max(4_096),
  aiFeedbackEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
  testCases: z.array(exerciseTestCaseSchema),
  hints: z.array(exerciseHintSchema),
});

export const materialSchema = z.object({
  id: z.uuid(),
  type: materialTypeSchema,
  title: titleSchema,
  position: positionSchema,
  isRequired: z.boolean(),
  isPublished: z.boolean(),
  programmingExercise: programmingExerciseSchema.nullable(),
});

export const lectureSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  isPublished: z.boolean(),
  materials: z.array(materialSchema),
});

export const courseModuleSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  isPublished: z.boolean(),
  lectures: z.array(lectureSchema),
});

export const courseDraftTreeSchema = z.object({
  course: courseSummarySchema,
  version: courseVersionSummarySchema,
  modules: z.array(courseModuleSchema),
});
export type CourseDraftTree = z.infer<typeof courseDraftTreeSchema>;

export const createCourseSchema = z.object({
  academyId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema.default(""),
});

export const updateCourseSchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
});

export const courseIdInputSchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
});

export const courseVersionInputSchema = courseIdInputSchema.extend({
  versionId: z.uuid(),
});

export const createCourseModuleSchema = courseVersionInputSchema.extend({
  title: titleSchema,
  description: descriptionSchema.default(""),
  position: positionSchema.optional(),
});

export const createLectureSchema = courseVersionInputSchema.extend({
  moduleId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema.default(""),
  position: positionSchema.optional(),
});

export const updateCourseModuleSchema = courseVersionInputSchema.extend({
  moduleId: z.uuid(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  isPublished: z.boolean().optional(),
});

export const deleteCourseModuleSchema = courseVersionInputSchema.extend({
  moduleId: z.uuid(),
});

export const reorderCourseModulesSchema = courseVersionInputSchema.extend({
  orderedModuleIds: z.array(z.uuid()).min(1),
});

export const updateLectureSchema = courseVersionInputSchema.extend({
  lectureId: z.uuid(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  isPublished: z.boolean().optional(),
});

export const deleteLectureSchema = courseVersionInputSchema.extend({
  lectureId: z.uuid(),
});

export const reorderLecturesSchema = courseVersionInputSchema.extend({
  moduleId: z.uuid(),
  orderedLectureIds: z.array(z.uuid()).min(1),
});

const richDescriptionSchema = z.string().max(10_000);

export const exerciseTestCaseDraftSchema = z.object({
  input: z.string().max(100_000),
  expectedOutput: z.string().max(100_000),
  visibility: testCaseVisibilitySchema,
});

export const exerciseHintDraftSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  triggerExpression: z.string().trim().max(2_000).nullable(),
});

export const exerciseDraftFieldsSchema = z.object({
  title: titleSchema,
  difficulty: exerciseDifficultySchema,
  description: richDescriptionSchema,
  inputFormat: z.string().max(10_000),
  outputFormat: z.string().max(10_000),
  constraints: z.string().max(10_000),
  starterCode: z.string().max(100_000),
  aiFeedbackEnabled: z.boolean(),
  isPublished: z.boolean(),
  testCases: z.array(exerciseTestCaseDraftSchema).min(1).max(50),
  hints: z.array(exerciseHintDraftSchema),
});
export type ExerciseDraftFields = z.infer<typeof exerciseDraftFieldsSchema>;

/**
 * Students need at least one worked example, so a saveable exercise always
 * keeps one SAMPLE case. Authors choose which cases those are per case.
 */
export function hasSampleTestCase(
  testCases: Array<{ visibility: TestCaseVisibility; expectedOutput: string }>,
) {
  return testCases.some(
    (testCase) =>
      testCase.visibility === "SAMPLE" &&
      testCase.expectedOutput.trim().length > 0,
  );
}

const sampleTestCaseRefinement = {
  error: "At least one visible sample test case is required.",
  path: ["testCases"],
};

export const exerciseParentInputSchema = courseVersionInputSchema.extend({
  lectureId: z.uuid(),
});

export const createProgrammingExerciseSchema = exerciseParentInputSchema
  .extend(exerciseDraftFieldsSchema.shape)
  .strict()
  .refine((input) => hasSampleTestCase(input.testCases), sampleTestCaseRefinement);

export const exerciseMaterialInputSchema = exerciseParentInputSchema.extend({
  materialId: z.uuid(),
});

/**
 * Toggling a problem's visibility from the curriculum tree, without loading and
 * resubmitting the whole exercise draft.
 */
export const setExerciseVisibilitySchema = exerciseMaterialInputSchema.extend({
  isPublished: z.boolean(),
});

export const updateProgrammingExerciseSchema = exerciseMaterialInputSchema
  .extend({
    ...exerciseDraftFieldsSchema.shape,
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict()
  .refine((input) => hasSampleTestCase(input.testCases), sampleTestCaseRefinement);

export const deleteProgrammingExerciseSchema = exerciseMaterialInputSchema;

export const reorderProgrammingExercisesSchema =
  exerciseParentInputSchema.extend({
    orderedMaterialIds: z.array(z.uuid()).min(1),
  });

export const exerciseAuthoringContextSchema = z.object({
  course: z.object({ id: z.uuid(), title: titleSchema }),
  version: courseVersionSummarySchema,
  module: z.object({ id: z.uuid(), title: titleSchema }),
  lecture: z.object({ id: z.uuid(), title: titleSchema }),
  material: materialSchema.nullable(),
});
export type ExerciseAuthoringContext = z.infer<
  typeof exerciseAuthoringContextSchema
>;

/**
 * Publish blockers are reported per item so the builder can link an issue
 * straight to the module or lecture that causes it.
 */
export const contentValidationIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
  moduleId: z.uuid().nullable(),
  lectureId: z.uuid().nullable(),
  materialId: z.uuid().nullable(),
});
export type ContentValidationIssue = z.infer<
  typeof contentValidationIssueSchema
>;

export const courseVersionValidationSchema = z.object({
  versionId: z.uuid(),
  publishable: z.boolean(),
  issues: z.array(contentValidationIssueSchema),
});
export type CourseVersionValidation = z.infer<
  typeof courseVersionValidationSchema
>;

export const publishCourseVersionResultSchema = z.object({
  course: courseSummarySchema,
  publishedVersion: courseVersionSummarySchema,
});
export type PublishCourseVersionResult = z.infer<
  typeof publishCourseVersionResultSchema
>;
