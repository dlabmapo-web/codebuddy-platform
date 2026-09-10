import { z } from "zod";

import { courseProvenanceSchema } from "../platform/library.js";

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
export const programmingExerciseDescriptionMaxLength = 500_000;
export const programmingExerciseSolutionMaxLength = 100_000;
const programmingExerciseDescriptionSchema = z
  .string()
  .max(programmingExerciseDescriptionMaxLength);
const positionSchema = z.number().int().positive();

/** What the curriculum currently holds, for the course list. */
export const courseContentCountsSchema = z.object({
  modules: z.number().int().nonnegative(),
  lectures: z.number().int().nonnegative(),
  exercises: z.number().int().nonnegative(),
  /**
   * Problems a student could actually reach, were the course visible.
   *
   * A problem counts only when it, its lecture and its module are all visible,
   * which is the same ancestor chain `effectivelyVisibleMaterialWhere` walks on
   * the server. `exercises` counts every problem regardless — a course can hold
   * a hundred and deliver none, and the two numbers side by side are what makes
   * that legible instead of baffling.
   */
  visibleExercises: z.number().int().nonnegative(),
});
export type CourseContentCounts = z.infer<typeof courseContentCountsSchema>;

export const courseSummarySchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  isVisible: z.boolean(),
  content: courseContentCountsSchema,
  /**
   * Where this course came from, when it came from the content library.
   *
   * Null for a course the academy authored itself, which is most of them. It
   * rides on the summary rather than arriving from a second endpoint because
   * the branch's course list draws the sync chip on every row, and a list that
   * had to fetch provenance separately would render the chips a beat late.
   */
  provenance: courseProvenanceSchema.nullable().default(null),
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
  description: programmingExerciseDescriptionSchema,
  inputFormat: z.string().max(10_000),
  outputFormat: z.string().max(10_000),
  constraints: z.string().max(10_000),
  starterCode: z.string().max(100_000),
  language: exerciseLanguageSchema,
  timeLimitMs: z.number().int().min(100).max(60_000),
  memoryLimitMb: z.number().int().min(16).max(4_096),
  aiFeedbackEnabled: z.boolean(),
  gradingRevision: z.number().int().positive(),
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
  isVisible: z.boolean(),
  programmingExercise: programmingExerciseSchema.nullable(),
});

export const lectureSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  isVisible: z.boolean(),
  materials: z.array(materialSchema),
});

export const courseModuleSchema = z.object({
  id: z.uuid(),
  title: titleSchema,
  description: descriptionSchema,
  position: positionSchema,
  isVisible: z.boolean(),
  lectures: z.array(lectureSchema),
});

export const courseTreeSchema = z.object({
  course: courseSummarySchema,
  modules: z.array(courseModuleSchema),
});
export type CourseTree = z.infer<typeof courseTreeSchema>;

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

export const setCourseVisibilitySchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
  isVisible: z.boolean(),
});

/**
 * Every module, lecture and problem under one course, in one write.
 *
 * The course's own visibility is deliberately not part of this: publishing a
 * course and stocking it are two decisions, and collapsing them would take away
 * the only way to prepare a course before students can reach it.
 */
export const setCourseContentVisibilitySchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
  isVisible: z.boolean(),
});

/**
 * A course students cannot learn anything from, that nobody has been told about.
 *
 * True only for a *published* course with nothing visible inside it. A hidden
 * course with hidden content is an ordinary draft, and warning about those would
 * teach people to ignore the warning that matters.
 */
export function courseHasNoVisibleContent(course: {
  isVisible: boolean;
  content: { visibleExercises: number };
}): boolean {
  return course.isVisible && course.content.visibleExercises === 0;
}

export const courseIdInputSchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
});

export const createCourseModuleSchema = courseIdInputSchema.extend({
  title: titleSchema,
  description: descriptionSchema.default(""),
  position: positionSchema.optional(),
});

export const createLectureSchema = courseIdInputSchema.extend({
  moduleId: z.uuid(),
  title: titleSchema,
  description: descriptionSchema.default(""),
  position: positionSchema.optional(),
});

export const updateCourseModuleSchema = courseIdInputSchema.extend({
  moduleId: z.uuid(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  isVisible: z.boolean().optional(),
});

export const deleteCourseModuleSchema = courseIdInputSchema.extend({
  moduleId: z.uuid(),
});

export const reorderCourseModulesSchema = courseIdInputSchema.extend({
  orderedModuleIds: z.array(z.uuid()).min(1),
});

export const updateLectureSchema = courseIdInputSchema.extend({
  lectureId: z.uuid(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  isVisible: z.boolean().optional(),
});

export const deleteLectureSchema = courseIdInputSchema.extend({
  lectureId: z.uuid(),
});

export const reorderLecturesSchema = courseIdInputSchema.extend({
  moduleId: z.uuid(),
  orderedLectureIds: z.array(z.uuid()).min(1),
});

/**
 * The five ways a case's output can be judged.
 *
 * Named for Elice's generated identifiers so an imported grader maps one to
 * one. `STDOUT` is the normalized equality every case used before this, and
 * stays the default so existing content is unaffected.
 */
export const caseComparators = [
  "STDOUT",
  "STDOUT_MATCH",
  "STDOUT_NOMATCH",
  "STDOUT_REGEX",
  "STDOUT_REGEX_NOMATCH",
] as const;
export const caseComparatorSchema = z.enum(caseComparators);
export type CaseComparator = z.infer<typeof caseComparatorSchema>;

export const gradingProfileModes = ["LEGACY_STDIO", "ELICE_STDIO"] as const;
export const programmingExerciseGradingModeSchema = z.enum(gradingProfileModes);
export type GradingProfileMode = z.infer<
  typeof programmingExerciseGradingModeSchema
>;

/**
 * Comparison and scoring semantics, by version.
 *
 * Dispatch reads the version stored with the exercise or submission, never a
 * constant in source: a submission graded under `legacy-v1` must keep being
 * graded that way after a newer version ships, or a regrade would rescore
 * historical work under rules it was never judged by. An unknown version is a
 * configuration error, not a wrong answer — fail closed.
 */
export const gradingSemanticVersions = ["legacy-v1", "elice-v1"] as const;
export const gradingSemanticVersionSchema = z.enum(gradingSemanticVersions);
export type GradingSemanticVersion = z.infer<
  typeof gradingSemanticVersionSchema
>;

/** The version new enhanced profiles are authored at. Never used for reading. */
export const currentEliceSemanticVersion: GradingSemanticVersion = "elice-v1";

export const exerciseTestCaseDraftSchema = z
  .object({
    input: z.string().max(100_000),
    expectedOutput: z.string().max(100_000),
    visibility: testCaseVisibilitySchema,
    comparator: caseComparatorSchema.default("STDOUT"),
    /**
     * Points this case contributes. Equal weights reproduce the old
     * equal-percentage scoring exactly. Zero is allowed, for a case that
     * demonstrates something without being worth anything.
     */
    weight: z.number().int().min(0).max(10_000).default(1),
    timeLimitMsOverride: z.number().int().min(100).max(60_000).nullable().default(null),
    /** Paired with `softPenalty`; see the refinement below. */
    softTimeLimitMs: z.number().int().min(1).max(60_000).nullable().default(null),
    softPenalty: z.number().int().min(0).max(10_000).nullable().default(null),
    label: z.string().trim().max(200).nullable().default(null),
  })
  .refine(
    (value) =>
      (value.softTimeLimitMs === null) === (value.softPenalty === null),
    {
      error:
        "A soft time limit and its penalty must be set together.",
      path: ["softTimeLimitMs"],
    },
  )
  .refine(
    (value) =>
      value.softPenalty === null || value.softPenalty <= value.weight,
    {
      // Otherwise a slow-but-correct answer would score below a wrong one.
      error: "A soft penalty cannot exceed the case's weight.",
      path: ["softPenalty"],
    },
  )
  .refine(
    (value) =>
      value.softTimeLimitMs === null ||
      value.timeLimitMsOverride === null ||
      value.softTimeLimitMs < value.timeLimitMsOverride,
    {
      error: "A soft time limit must be below the case's hard limit.",
      path: ["softTimeLimitMs"],
    },
  );

export const exerciseHintDraftSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  triggerExpression: z.string().trim().max(2_000).nullable(),
});

export const exerciseDraftFieldsSchema = z.object({
  title: titleSchema,
  difficulty: exerciseDifficultySchema,
  description: programmingExerciseDescriptionSchema,
  inputFormat: z.string().max(10_000),
  outputFormat: z.string().max(10_000),
  constraints: z.string().max(10_000),
  starterCode: z.string().max(100_000),
  solutionCode: z
    .string()
    .max(programmingExerciseSolutionMaxLength)
    .refine((value) => value.trim().length > 0, {
      error: "A correct answer is required.",
    }),
  aiFeedbackEnabled: z.boolean(),
  isVisible: z.boolean(),
  /**
   * Optional. A problem with no answers yet is an ordinary half-written
   * problem, and the product already knows what to do with one: a student can
   * never submit to it (`SubmissionService` refuses with
   * `EXERCISE_NOT_AVAILABLE` inside the transaction that owns the grading
   * snapshot) and the console counts it as `problemsWithoutTests` on the
   * library, the content table and an academy's vitals. Refusing to *save* one
   * only meant an author had to invent an answer before they could write down
   * the question.
   */
  testCases: z.array(exerciseTestCaseDraftSchema).max(50),
  hints: z.array(exerciseHintDraftSchema),
});
export type ExerciseDraftFields = z.infer<typeof exerciseDraftFieldsSchema>;

/**
 * Whether a student would be shown a worked example.
 *
 * No longer a condition of saving — a problem may be written before it can be
 * graded — but still what the authoring form reports, so an author can see at a
 * glance that this problem cannot yet be attempted.
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

export const exerciseParentInputSchema = courseIdInputSchema.extend({
  lectureId: z.uuid(),
});

export const createProgrammingExerciseSchema = exerciseParentInputSchema
  .extend(exerciseDraftFieldsSchema.shape)
  .strict();

export const exerciseMaterialInputSchema = exerciseParentInputSchema.extend({
  materialId: z.uuid(),
});

export const exerciseSolutionSchema = z.object({
  materialId: z.uuid(),
  solutionCode: z.string().nullable(),
});

/**
 * Toggling a problem's visibility from the curriculum tree, without loading and
 * resubmitting the whole exercise draft.
 */
export const setExerciseVisibilitySchema = exerciseMaterialInputSchema.extend({
  isVisible: z.boolean(),
});

export const updateProgrammingExerciseSchema = exerciseMaterialInputSchema
  .extend({
    ...exerciseDraftFieldsSchema.shape,
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();

export const deleteProgrammingExerciseSchema = exerciseMaterialInputSchema;

export const reorderProgrammingExercisesSchema =
  exerciseParentInputSchema.extend({
    orderedMaterialIds: z.array(z.uuid()).min(1),
  });

export const exerciseAuthoringContextSchema = z.object({
  course: z.object({ id: z.uuid(), title: titleSchema }),
  module: z.object({ id: z.uuid(), title: titleSchema }),
  lecture: z.object({ id: z.uuid(), title: titleSchema }),
  material: materialSchema.nullable(),
});
export type ExerciseAuthoringContext = z.infer<
  typeof exerciseAuthoringContextSchema
>;

/**
 * Deleting a course, with everything under it.
 *
 * The academy's own destructive act, and it carries the same lock the
 * platform's academy deletion does: the title typed back. A course is modules,
 * lectures and problems somebody spent a term writing, and `setVisibility` is
 * the reversible answer for a course that should merely stop being taught.
 */
export const deleteCourseSchema = z
  .object({
    academyId: z.uuid(),
    courseId: z.uuid(),
    /** The course's exact title, typed by the person deleting it. */
    confirmTitle: z.string().trim().min(1),
  })
  .strict();
export type DeleteCourseInput = z.infer<typeof deleteCourseSchema>;
