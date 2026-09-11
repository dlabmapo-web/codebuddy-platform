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

/** The version a mode is authored at. Reading always uses the stored value. */
export function semanticVersionForMode(
  mode: GradingProfileMode,
): GradingSemanticVersion {
  return mode === "ELICE_STDIO" ? currentEliceSemanticVersion : "legacy-v1";
}

/**
 * How earned weight becomes the material's score. `PROPORTIONAL` is Cove's
 * policy for new profiles, not verified Elice Relative behaviour (V1);
 * `ABSOLUTE_CAP` is Elice's Absolute grade, `min(maximum, earned)`.
 */
export const materialScorePolicies = ["PROPORTIONAL", "ABSOLUTE_CAP"] as const;
export const materialScorePolicySchema = z.enum(materialScorePolicies);
export type MaterialScorePolicy = z.infer<typeof materialScorePolicySchema>;

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
  /**
   * Read back so the editor writes back exactly what is stored. An editor
   * that did not know these fields would save every case at weight 1.
   */
  comparator: caseComparatorSchema,
  weight: z.number().int().nonnegative(),
  timeLimitMsOverride: z.number().int().positive().nullable(),
  softTimeLimitMs: z.number().int().positive().nullable(),
  softPenalty: z.number().int().nonnegative().nullable(),
  label: z.string().nullable(),
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
  /** The stored profile, including the semantic version it was authored at. */
  grading: z.object({
    mode: programmingExerciseGradingModeSchema,
    /** A string, not the registry enum: a stored version is reported as is. */
    semanticVersion: z.string(),
    totalTimeLimitMs: z.number().int().positive().nullable(),
    comparatorTimeLimitMs: z.number().int().positive().nullable(),
    materialMaximumHundredths: z.number().int().positive().nullable(),
    materialScorePolicy: materialScorePolicySchema.nullable(),
  }),
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
 * The per-case limit every authored exercise runs at. Exercise-level limits
 * are not editable yet; a case override is the only way to change one.
 */
export const defaultExerciseTimeLimitMs = 3_000;

/**
 * Server-enforced ceilings on an enhanced profile.
 *
 * The total stays well under the judge's ten-minute stale sweep, or a long but
 * legitimate run would be reported lost while it was still grading.
 */
export const gradingProfileBounds = {
  totalTimeLimitMs: { min: 1_000, max: 300_000, default: 60_000 },
  comparatorTimeLimitMs: { min: 10, max: 2_000, default: 100 },
  /** Material points in hundredths: 0.01 to 1,000.00. */
  materialMaximumHundredths: { min: 1, max: 100_000, default: 10_000 },
} as const;

/**
 * The exercise-level half of a grading profile, as an author writes it.
 *
 * Every field is stated on every write, never defaulted: a client that did
 * not know about weighted grading would otherwise save an enhanced exercise
 * back to legacy, and its weights with it, without anyone having chosen that.
 */
export const exerciseGradingProfileSchema = z.object({
  mode: programmingExerciseGradingModeSchema,
  totalTimeLimitMs: z
    .number()
    .int()
    .min(gradingProfileBounds.totalTimeLimitMs.min)
    .max(gradingProfileBounds.totalTimeLimitMs.max)
    .nullable(),
  comparatorTimeLimitMs: z
    .number()
    .int()
    .min(gradingProfileBounds.comparatorTimeLimitMs.min)
    .max(gradingProfileBounds.comparatorTimeLimitMs.max)
    .nullable(),
  materialMaximumHundredths: z
    .number()
    .int()
    .min(gradingProfileBounds.materialMaximumHundredths.min)
    .max(gradingProfileBounds.materialMaximumHundredths.max)
    .nullable(),
  materialScorePolicy: materialScorePolicySchema.nullable(),
});
export type ExerciseGradingProfile = z.infer<typeof exerciseGradingProfileSchema>;

export const legacyGradingProfile: ExerciseGradingProfile = {
  mode: "LEGACY_STDIO",
  totalTimeLimitMs: null,
  comparatorTimeLimitMs: null,
  materialMaximumHundredths: null,
  materialScorePolicy: null,
};

export const defaultEliceGradingProfile: ExerciseGradingProfile = {
  mode: "ELICE_STDIO",
  totalTimeLimitMs: gradingProfileBounds.totalTimeLimitMs.default,
  comparatorTimeLimitMs: gradingProfileBounds.comparatorTimeLimitMs.default,
  materialMaximumHundredths: gradingProfileBounds.materialMaximumHundredths.default,
  materialScorePolicy: "PROPORTIONAL",
};

/** A case exactly as legacy grading understands it. */
export const legacyCaseGrading = {
  comparator: "STDOUT",
  weight: 1,
  timeLimitMsOverride: null,
  softTimeLimitMs: null,
  softPenalty: null,
} as const;

export const exerciseTestCaseDraftSchema = z
  .object({
    input: z.string().max(100_000),
    expectedOutput: z.string().max(100_000),
    visibility: testCaseVisibilitySchema,
    /** Required for the same reason as the profile: never silently reset. */
    comparator: caseComparatorSchema,
    /**
     * Points this case contributes. Equal weights reproduce the old
     * equal-percentage scoring exactly. Zero is allowed, for a case that
     * demonstrates something without being worth anything.
     */
    weight: z.number().int().min(0).max(10_000),
    timeLimitMsOverride: z.number().int().min(100).max(60_000).nullable(),
    /** Paired with `softPenalty`; see the refinement below. */
    softTimeLimitMs: z.number().int().min(1).max(60_000).nullable(),
    softPenalty: z.number().int().min(0).max(10_000).nullable(),
    label: z.string().trim().max(200).nullable(),
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

export type ExerciseTestCaseDraft = z.infer<typeof exerciseTestCaseDraftSchema>;

export const gradingIssueCodes = [
  "needs_weighted_grading",
  "needs_setting",
  "no_points",
  "soft_limit_not_below_hard",
  "case_limit_exceeds_total",
  "empty_negative_rule",
] as const;
export type GradingIssueCode = (typeof gradingIssueCodes)[number];

/** A code for the editor to translate, a message for everyone else. */
export type GradingIssue = {
  code: GradingIssueCode;
  path: Array<string | number>;
  message: string;
};

/**
 * What a grading profile and its cases may not say together.
 *
 * Shared by the editor and the server, so an author sees the refusal before
 * saving and a client that skips the editor is refused all the same. Legacy
 * grading has no way to honour a comparator, a weight or a limit, so a legacy
 * exercise carrying one is rejected rather than saved with the setting quietly
 * ignored — that silent loss is exactly what this exists to prevent.
 *
 * `timeLimitMs` is the exercise's own per-case limit; the server passes the
 * stored value, the editor the authoring default.
 */
export function gradingProfileIssues(input: {
  grading: ExerciseGradingProfile;
  testCases: ReadonlyArray<ExerciseTestCaseDraft>;
  timeLimitMs?: number;
}): GradingIssue[] {
  const issues: GradingIssue[] = [];
  const { grading, testCases } = input;
  const exerciseLimit = input.timeLimitMs ?? defaultExerciseTimeLimitMs;

  if (grading.mode === "LEGACY_STDIO") {
    const profileFields = [
      "totalTimeLimitMs",
      "comparatorTimeLimitMs",
      "materialMaximumHundredths",
      "materialScorePolicy",
    ] as const;
    for (const field of profileFields) {
      if (grading[field] !== null) {
        issues.push({
          code: "needs_weighted_grading",
          path: ["grading", field],
          message: "This setting needs weighted grading.",
        });
      }
    }
    testCases.forEach((testCase, index) => {
      for (const field of Object.keys(legacyCaseGrading) as Array<
        keyof typeof legacyCaseGrading
      >) {
        if (testCase[field] !== legacyCaseGrading[field]) {
          issues.push({
            code: "needs_weighted_grading",
            path: ["testCases", index, field],
            message:
              "Standard grading scores every case equally by exact output. Switch to weighted grading to use this setting.",
          });
        }
      }
    });
    return issues;
  }

  const required = [
    "totalTimeLimitMs",
    "comparatorTimeLimitMs",
    "materialMaximumHundredths",
    "materialScorePolicy",
  ] as const;
  for (const field of required) {
    if (grading[field] === null) {
      issues.push({
        code: "needs_setting",
        path: ["grading", field],
        message: "Weighted grading needs this setting.",
      });
    }
  }
  if (
    testCases.length > 0 &&
    testCases.reduce((total, testCase) => total + testCase.weight, 0) <= 0
  ) {
    // An automatically scored profile worth nothing cannot produce a score.
    issues.push({
      code: "no_points",
      path: ["testCases"],
      message: "At least one case must be worth points.",
    });
  }
  testCases.forEach((testCase, index) => {
    const hardLimit = testCase.timeLimitMsOverride ?? exerciseLimit;
    if (testCase.softTimeLimitMs !== null && testCase.softTimeLimitMs >= hardLimit) {
      issues.push({
        code: "soft_limit_not_below_hard",
        path: ["testCases", index, "softTimeLimitMs"],
        message: "A soft time limit must be below the case's hard limit.",
      });
    }
    if (grading.totalTimeLimitMs !== null && hardLimit > grading.totalTimeLimitMs) {
      issues.push({
        code: "case_limit_exceeds_total",
        path: ["testCases", index, "timeLimitMsOverride"],
        message: "A case's time limit cannot exceed the whole run's.",
      });
    }
    if (
      (testCase.comparator === "STDOUT_NOMATCH" ||
        testCase.comparator === "STDOUT_REGEX_NOMATCH") &&
      testCase.expectedOutput.length === 0
    ) {
      // Everything contains the empty string and every pattern search finds
      // it, so this rule can never pass. Refused rather than published.
      issues.push({
        code: "empty_negative_rule",
        path: ["testCases", index, "expectedOutput"],
        message: "An empty text makes a 'does not contain' rule impossible to pass.",
      });
    }
  });
  return issues;
}

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
  /** How the cases above are judged and scored. See `gradingProfileIssues`. */
  grading: exerciseGradingProfileSchema,
  hints: z.array(exerciseHintDraftSchema),
});
export type ExerciseDraftFields = z.infer<typeof exerciseDraftFieldsSchema>;

function refineGrading(
  value: Pick<ExerciseDraftFields, "grading" | "testCases">,
  context: z.RefinementCtx,
) {
  for (const issue of gradingProfileIssues(value)) {
    context.addIssue({ code: "custom", message: issue.message, path: issue.path });
  }
}

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
  .strict()
  .superRefine(refineGrading);

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
  .strict()
  .superRefine(refineGrading);

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
