import {
  gradingProfileBounds,
  runtimeDescriptorSchema,
  runtimeDescriptorIdentity,
  inputPromptPolicySchema,
  inputPromptPolicyForSemanticVersion,
  type InputPromptPolicy,
  legacyCaseGrading,
  type CaseComparator,
  type GradingProfileMode,
  type MaterialScorePolicy,
} from "@cove/shared";
import { z } from "zod";

import { MAX_OUTPUT_BYTES } from "./execution-engine.js";

/**
 * A grading profile as it travels from an exercise onto a submission, and from
 * a submission into the judge.
 *
 * One module for both directions, so admission and grading cannot disagree
 * about what a profile means: `SubmissionService` and the maintenance regrade
 * both snapshot through `gradingSnapshotFor`, and the judge reads the snapshot
 * back through `resolveGradingProfile` — never the exercise, which may have
 * changed since the student pressed Submit.
 */

type ContinuationPolicy = "LEGACY_STOP_ON_RESOURCE" | "CONTINUE_WITHIN_BUDGET";
type ExitStatusPolicy = "FAIL_ON_RUNTIME_ERROR";

type ProfileColumns = {
  inputPromptPolicy?: InputPromptPolicy;
  gradingMode: GradingProfileMode;
  gradingSemanticVersion: string;
  totalTimeLimitMs: number | null;
  comparatorTimeLimitMs: number | null;
  continuationPolicy: ContinuationPolicy;
  exitStatusPolicy: ExitStatusPolicy;
  materialMaximumHundredths: number | null;
  materialScorePolicy: MaterialScorePolicy | null;
};

type CaseGrading = {
  comparator: CaseComparator;
  weight: number;
  timeLimitMsOverride: number | null;
  softTimeLimitMs: number | null;
  softPenalty: number | null;
};

/** What an exercise must supply to be snapshotted. */
export type ExerciseGradingSource = ProfileColumns & {
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: ReadonlyArray<
    CaseGrading & {
      input: string;
      expectedOutput: string;
      visibility: "SAMPLE" | "HIDDEN";
      label: string | null;
    }
  >;
};

/**
 * Effective ceilings and runtime identity, frozen with an enhanced submission.
 *
 * Versioned, and validated when the judge reads it back: a snapshot this code
 * does not understand is refused as a configuration error rather than guessed
 * at. Never holds a secret.
 */
const gradingPolicySnapshotBaseSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  inputPromptPolicy: inputPromptPolicySchema.optional(),
  semanticVersion: z.string(),
  runtime: z.object({
    engine: z.literal("pyodide"),
    engineVersion: z.string(),
  }),
  comparator: z.object({
    runtime: z.literal("pyodide-cpython"),
    engineVersion: z.string(),
    budgetMs: z.number().int().positive(),
  }),
  ceilings: z.object({
    totalTimeLimitMs: z.number().int().positive(),
    caseTimeLimitMs: z.number().int().positive(),
    memoryLimitMb: z.number().int().positive(),
    outputBytes: z.number().int().positive().max(MAX_OUTPUT_BYTES),
  }),
});
const historicalGradingPolicySnapshotSchema = gradingPolicySnapshotBaseSchema.superRefine((policy, ctx) => {
  const valid = policy.version === 3
    ? policy.semanticVersion === "elice-v2" && policy.inputPromptPolicy === "IGNORE"
    : policy.semanticVersion === "elice-v1" && (policy.inputPromptPolicy === undefined || policy.inputPromptPolicy === "INCLUDE");
  if (!valid) ctx.addIssue({ code: "custom", message: "Inconsistent prompt policy snapshot" });
});
const gradingPolicySnapshotV4Schema = gradingPolicySnapshotBaseSchema.omit({ version: true, runtime: true, inputPromptPolicy: true }).extend({
  version: z.literal(4), runtime: runtimeDescriptorSchema, inputPromptPolicy: inputPromptPolicySchema,
  comparator: z.strictObject({
    runtime: z.literal("pyodide-cpython"), engineVersion: z.string().min(1).max(128),
    budgetMs: z.number().int().min(gradingProfileBounds.comparatorTimeLimitMs.min).max(gradingProfileBounds.comparatorTimeLimitMs.max),
  }),
  ceilings: z.strictObject({
    totalTimeLimitMs: z.number().int().min(gradingProfileBounds.totalTimeLimitMs.min).max(gradingProfileBounds.totalTimeLimitMs.max),
    caseTimeLimitMs: z.number().int().min(100).max(60000),
    memoryLimitMb: z.number().int().min(16).max(4096),
    outputBytes: z.number().int().positive().max(MAX_OUTPUT_BYTES),
  }),
}).strict().superRefine((policy, ctx) => {
  if (!((policy.semanticVersion === "elice-v1" && policy.inputPromptPolicy === "INCLUDE") ||
        (policy.semanticVersion === "elice-v2" && policy.inputPromptPolicy === "IGNORE")))
    ctx.addIssue({ code: "custom", message: "Inconsistent prompt policy snapshot" });
});
export const gradingPolicySnapshotSchema = z.union([historicalGradingPolicySnapshotSchema, gradingPolicySnapshotV4Schema]);
export type GradingPolicySnapshot = z.infer<typeof gradingPolicySnapshotSchema>;

/**
 * The submission-side copy of an exercise's profile and cases.
 *
 * Every case field is copied, not just the three legacy ones: a snapshot that
 * dropped the comparator or the weight would be graded by defaults, which is
 * the silent loss the snapshot exists to prevent. The resolved per-case limit
 * is written too, so a regrade applies the limit the student was held to.
 */
export function gradingSnapshotFor(
  exercise: ExerciseGradingSource,
  runtime: { engineVersion: string },
) {
  const enhanced = exercise.gradingMode === "ELICE_STDIO";
  const policy: GradingPolicySnapshot | null = enhanced
    ? {
        // Older workers only understand v1 and must refuse these submissions
        // rather than grade them using their smaller, hardcoded output cap.
        version: exercise.inputPromptPolicy === "IGNORE" ? 3 : 2,
        ...(exercise.inputPromptPolicy === "IGNORE" ? { inputPromptPolicy: "IGNORE" as const } : {}),
        semanticVersion: exercise.gradingSemanticVersion,
        runtime: { engine: "pyodide", engineVersion: runtime.engineVersion },
        comparator: {
          runtime: "pyodide-cpython",
          engineVersion: runtime.engineVersion,
          budgetMs:
            exercise.comparatorTimeLimitMs ??
            gradingProfileBounds.comparatorTimeLimitMs.default,
        },
        ceilings: {
          totalTimeLimitMs:
            exercise.totalTimeLimitMs ??
            gradingProfileBounds.totalTimeLimitMs.default,
          caseTimeLimitMs: exercise.timeLimitMs,
          memoryLimitMb: exercise.memoryLimitMb,
          outputBytes: MAX_OUTPUT_BYTES,
        },
      }
    : null;

  return {
    submission: {
      submissionPolicy: "AUTOMATIC" as const,
      inputPromptPolicy: exercise.inputPromptPolicy ?? "INCLUDE",
      gradingMode: exercise.gradingMode,
      gradingSemanticVersion: exercise.gradingSemanticVersion,
      totalTimeLimitMs: exercise.totalTimeLimitMs,
      comparatorTimeLimitMs: exercise.comparatorTimeLimitMs,
      continuationPolicy: exercise.continuationPolicy,
      exitStatusPolicy: exercise.exitStatusPolicy,
      materialMaximumHundredths: exercise.materialMaximumHundredths,
      materialScorePolicy: exercise.materialScorePolicy,
      // Legacy rows have never carried one, and a new legacy row matches them.
      ...(policy ? { gradingPolicySnapshot: policy } : {}),
    },
    cases: exercise.testCases.map((testCase, index) => ({
      position: index + 1,
      input: testCase.input,
      expectedOutput: testCase.expectedOutput,
      isSample: testCase.visibility === "SAMPLE",
      comparator: testCase.comparator,
      weight: testCase.weight,
      timeLimitMsOverride: testCase.timeLimitMsOverride,
      softTimeLimitMs: testCase.softTimeLimitMs,
      softPenalty: testCase.softPenalty,
      label: testCase.label,
      effectiveTimeLimitMs: enhanced
        ? (testCase.timeLimitMsOverride ?? exercise.timeLimitMs)
        : null,
    })),
  };
}

export type ResolvedGradingProfile =
  | { kind: "legacy"; inputPromptPolicy: InputPromptPolicy }
  | {
      kind: "elice";
      inputPromptPolicy: InputPromptPolicy;
      totalTimeLimitMs: number;
      comparatorTimeLimitMs: number;
      continuationPolicy: ContinuationPolicy;
      materialMaximumHundredths: number;
      materialScorePolicy: MaterialScorePolicy;
      /** Present when the caller passed a snapshot to check. */
      policy: GradingPolicySnapshot | null;
    }
  | { kind: "unsupported"; reason: string };

/**
 * Which grader may judge this profile, or why none may.
 *
 * Dispatch is on the stored mode *and* semantic version, and everything
 * unrecognised fails closed: an unknown version, an enhanced profile missing a
 * budget, a legacy snapshot carrying a weight it has no way to honour. Each of
 * those is a configuration error to report, not a verdict to invent — the
 * legacy grader in particular must never quietly grade an enhanced snapshot by
 * ignoring half of it.
 *
 * `policySnapshot` is checked when given (the judge passes it; admission has
 * not built it yet).
 */
export function resolveGradingProfile(
  profile: ProfileColumns,
  cases: ReadonlyArray<CaseGrading>,
  policySnapshot?: unknown,
): ResolvedGradingProfile {
  const prompt = inputPromptPolicySchema.safeParse(profile.inputPromptPolicy === undefined ? "INCLUDE" : profile.inputPromptPolicy);
  if (!prompt.success) return unsupported("unknown input prompt policy");
  const inputPromptPolicy = prompt.data;
  const versionPolicy = inputPromptPolicyForSemanticVersion(profile.gradingMode, profile.gradingSemanticVersion);
  if (profile.gradingMode === "LEGACY_STDIO") {
    if (versionPolicy !== inputPromptPolicy) {
      return unsupported(`unknown legacy version ${profile.gradingSemanticVersion}`);
    }
    const carriesEnhancedSetting = cases.some((testCase) =>
      (Object.keys(legacyCaseGrading) as Array<keyof typeof legacyCaseGrading>).some(
        (field) => testCase[field] !== legacyCaseGrading[field],
      ),
    );
    if (carriesEnhancedSetting) {
      return unsupported("legacy profile carries case settings it cannot honour");
    }
    return { kind: "legacy", inputPromptPolicy };
  }

  if (profile.gradingMode !== "ELICE_STDIO") {
    return unsupported(`unknown grading mode ${String(profile.gradingMode)}`);
  }
  if (versionPolicy !== inputPromptPolicy) {
    return unsupported(`unknown enhanced version ${profile.gradingSemanticVersion}`);
  }
  const {
    totalTimeLimitMs,
    comparatorTimeLimitMs,
    materialMaximumHundredths,
    materialScorePolicy,
  } = profile;
  if (
    !within(totalTimeLimitMs, gradingProfileBounds.totalTimeLimitMs) ||
    !within(comparatorTimeLimitMs, gradingProfileBounds.comparatorTimeLimitMs) ||
    !within(materialMaximumHundredths, gradingProfileBounds.materialMaximumHundredths) ||
    materialScorePolicy === null
  ) {
    return unsupported("enhanced profile is missing a required bound");
  }
  if (profile.exitStatusPolicy !== "FAIL_ON_RUNTIME_ERROR") {
    return unsupported(`unknown exit status policy ${String(profile.exitStatusPolicy)}`);
  }
  if (cases.some((testCase) => testCase.weight < 0)) {
    return unsupported("negative case weight");
  }
  if (cases.reduce((total, testCase) => total + testCase.weight, 0) <= 0) {
    // Nothing to divide by. Authoring refuses this; a snapshot that has it
    // anyway is not something to score.
    return unsupported("enhanced profile is worth no points");
  }
  let policy: GradingPolicySnapshot | null = null;
  if (policySnapshot !== undefined) {
    const parsed = gradingPolicySnapshotSchema.safeParse(policySnapshot);
    if (!parsed.success || parsed.data.semanticVersion !== profile.gradingSemanticVersion) {
      return unsupported("policy snapshot missing or not understood");
    }
    policy = parsed.data;
  }
  return {
    kind: "elice",
    inputPromptPolicy,
    totalTimeLimitMs: totalTimeLimitMs!,
    comparatorTimeLimitMs: comparatorTimeLimitMs!,
    continuationPolicy: profile.continuationPolicy,
    materialMaximumHundredths: materialMaximumHundredths!,
    materialScorePolicy,
    policy,
  };
}

/**
 * Why the runtimes about to grade differ from the ones this submission was
 * recorded against, or null when they match.
 *
 * Python's regex engine, `splitlines`, number formatting and exception text
 * can all move between Pyodide releases, so a snapshot is only reproducible on
 * the runtime it names. An upgrade must not silently re-judge queued or
 * repaired work by different rules: the submission is refused as a judge
 * fault, and a maintenance regrade — which snapshots afresh against the
 * current runtime — is the deliberate, audited way to move it forward.
 *
 * Both sides are `pyodide-<version>`; `null` means "not known", which never
 * matches.
 */
export function runtimeMismatch(
  policy: GradingPolicySnapshot,
  running: { engine: string | null; comparator: string | null; descriptor?: unknown },
): string | null {
  if (policy.version === 4) {
    const parsed = runtimeDescriptorSchema.safeParse(running.descriptor);
    if (!parsed.success || runtimeDescriptorIdentity(parsed.data) !== runtimeDescriptorIdentity(policy.runtime))
      return "runner descriptor differs from frozen runtime";
  }
  const recordedEngine = `${policy.runtime.engine}-${policy.runtime.engineVersion}`;
  const recordedComparator = `pyodide-${policy.comparator.engineVersion}`;
  if (running.engine !== recordedEngine) {
    return `runner is ${running.engine ?? "unknown"}, submission recorded ${recordedEngine}`;
  }
  if (running.comparator !== recordedComparator) {
    return `comparator is ${running.comparator ?? "unknown"}, submission recorded ${recordedComparator}`;
  }
  return null;
}

function within(
  value: number | null,
  bounds: { min: number; max: number },
): value is number {
  return value !== null && value >= bounds.min && value <= bounds.max;
}

function unsupported(reason: string): ResolvedGradingProfile {
  return { kind: "unsupported", reason };
}

/** The exercise-side columns an authored profile writes, by mode. */
export function exerciseProfileColumns(grading: {
  mode: GradingProfileMode;
  inputPromptPolicy: InputPromptPolicy;
  totalTimeLimitMs: number | null;
  comparatorTimeLimitMs: number | null;
  materialMaximumHundredths: number | null;
  materialScorePolicy: MaterialScorePolicy | null;
}) {
  const enhanced = grading.mode === "ELICE_STDIO";
  return {
    gradingMode: grading.mode,
    inputPromptPolicy: grading.inputPromptPolicy,
    continuationPolicy: enhanced
      ? ("CONTINUE_WITHIN_BUDGET" as const)
      : ("LEGACY_STOP_ON_RESOURCE" as const),
    exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR" as const,
    totalTimeLimitMs: enhanced ? grading.totalTimeLimitMs : null,
    comparatorTimeLimitMs: enhanced ? grading.comparatorTimeLimitMs : null,
    materialMaximumHundredths: enhanced ? grading.materialMaximumHundredths : null,
    materialScorePolicy: enhanced ? grading.materialScorePolicy : null,
  };
}
