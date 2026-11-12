import { nativeRuntimeVersion } from "@cove/grading-runtime";
import { defaultEliceGradingProfile, nativeAnyRuntimeDescriptorSchema, type NativeAnyRuntimeDescriptor } from "@cove/shared";
import { inputPromptPolicySchema, programmingExerciseGradingModeSchema, inputPromptPolicyForSemanticVersion, type InputPromptPolicy } from "@cove/shared";
import type { ExerciseGradingSource } from "./grading-profile.js";
import { gradingSnapshotFor, gradingPolicySnapshotSchema, resolveGradingProfile } from "./grading-profile.js";
import type { SampleSnapshot } from "./sample-check.store.js";

/** Admission freezes one public case, using the same profile validation as Submit. */
export function sampleSnapshotFor(
  exercise: ExerciseGradingSource,
  testCase: ExerciseGradingSource["testCases"][number],
  code: string,
  engineVersion: string,
  descriptor?: NativeAnyRuntimeDescriptor | null,
): SampleSnapshot | null {
  const profile = resolveGradingProfile(exercise, exercise.testCases);
  if (profile.kind === "unsupported" || testCase.visibility !== "SAMPLE") return null;
  const language = exercise.language && exercise.language !== "PYTHON" ? exercise.language : undefined;
  // C and C++ run only on the GCC runtime, with weighted grading.
  if (language && (profile.kind !== "elice" || descriptor?.engine !== "native-gcc")) return null;
  if (profile.kind === "legacy") {
    return {
      inputPromptPolicy: profile.inputPromptPolicy,
      gradingSemanticVersion: exercise.gradingSemanticVersion,
      gradingMode: "LEGACY_STDIO",
      engineVersion: descriptor ? nativeRuntimeVersion(descriptor) : `pyodide-${engineVersion}`,
      ...(descriptor ? { executionRuntimeSnapshot: descriptor } : {}),
      code,
      memoryLimitMb: exercise.memoryLimitMb,
      // Infrastructure may wait for a runner; student execution still gets
      // precisely Submit's per-case limit, independent of startup latency.
      totalTimeLimitMs: Math.max(60_000, exercise.timeLimitMs),
      comparatorTimeLimitMs: 1,
      testCase: {
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        comparator: "STDOUT",
        softTimeLimitMs: null,
        caseLimitMs: exercise.timeLimitMs,
      },
    };
  }
  const snapshot = gradingSnapshotFor({ ...exercise, testCases: [testCase] }, { engineVersion, descriptor });
  const selected = snapshot.cases[0]!;
  return {
    inputPromptPolicy: profile.inputPromptPolicy,
    gradingSemanticVersion: exercise.gradingSemanticVersion,
    code,
    memoryLimitMb: exercise.memoryLimitMb,
    totalTimeLimitMs: profile.totalTimeLimitMs,
    comparatorTimeLimitMs: profile.comparatorTimeLimitMs,
    ...(descriptor ? { executionRuntimeSnapshot: descriptor } : {}),
    ...(language ? { language } : {}),
    policy: gradingPolicySnapshotSchema.parse(snapshot.submission.gradingPolicySnapshot),
    testCase: {
      input: selected.input,
      expectedOutput: selected.expectedOutput,
      comparator: selected.comparator,
      softTimeLimitMs: selected.softTimeLimitMs,
      caseLimitMs: selected.effectiveTimeLimitMs ?? exercise.timeLimitMs,
    },
  };
}

/** Manual Run executes one user input without borrowing a grading definition. */
export function runExerciseFor(exercise: ExerciseGradingSource, stdin: string): ExerciseGradingSource {
  if (exercise.submissionPolicy !== "MANUAL_REVIEW") return exercise;
  return {
    ...exercise, gradingMode: "ELICE_STDIO", gradingSemanticVersion: "elice-v1", inputPromptPolicy: "INCLUDE",
    totalTimeLimitMs: defaultEliceGradingProfile.totalTimeLimitMs,
    comparatorTimeLimitMs: defaultEliceGradingProfile.comparatorTimeLimitMs,
    materialMaximumHundredths: defaultEliceGradingProfile.materialMaximumHundredths,
    materialScorePolicy: defaultEliceGradingProfile.materialScorePolicy,
    continuationPolicy: "CONTINUE_WITHIN_BUDGET", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
    testCases: [{input: stdin, expectedOutput: "", visibility: "SAMPLE", comparator: "STDOUT",
      weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null}],
  };
}

/**
 * A C/C++ Run: the student's code on their own input, frozen like a sample
 * check with that input as its one case. Nothing is compared; the case limit
 * and memory are the exercise's, as Submit's would be.
 */
export function runSnapshotFor(
  exercise: ExerciseGradingSource,
  stdin: string,
  code: string,
  engineVersion: string,
  descriptor: NativeAnyRuntimeDescriptor,
  endOfInput = false,
): SampleSnapshot | null {
  exercise = runExerciseFor(exercise, stdin);
  const language = exercise.language;
  if (language !== "C" && language !== "CPP" || descriptor.engine !== "native-gcc") return null;
  const profile = resolveGradingProfile(exercise, exercise.testCases);
  if (profile.kind !== "elice") return null;
  const input = {
    input: stdin, expectedOutput: "", visibility: "SAMPLE" as const, comparator: "STDOUT" as const,
    weight: 1, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null,
  };
  const snapshot = gradingSnapshotFor({ ...exercise, testCases: [input] }, { engineVersion, descriptor });
  return {
    inputPromptPolicy: "INCLUDE",
    gradingSemanticVersion: exercise.gradingSemanticVersion,
    code,
    language,
    run: true,
    ...(endOfInput ? { endOfInput: true } : {}),
    memoryLimitMb: exercise.memoryLimitMb,
    totalTimeLimitMs: profile.totalTimeLimitMs,
    comparatorTimeLimitMs: profile.comparatorTimeLimitMs,
    executionRuntimeSnapshot: descriptor,
    policy: gradingPolicySnapshotSchema.parse(snapshot.submission.gradingPolicySnapshot),
    testCase: {
      input: stdin,
      expectedOutput: "",
      comparator: "STDOUT",
      softTimeLimitMs: null,
      caseLimitMs: exercise.timeLimitMs,
    },
  };
}

/** Historical Redis records lack both fields. New semantics must be explicit. */
export function sampleInputPromptPolicy(snapshot: SampleSnapshot): InputPromptPolicy | null {
  if (snapshot.executionRuntimeSnapshot !== undefined && !nativeAnyRuntimeDescriptorSchema.safeParse(snapshot.executionRuntimeSnapshot).success) return null;
  const parsed = inputPromptPolicySchema.safeParse(snapshot.inputPromptPolicy === undefined ? "INCLUDE" : snapshot.inputPromptPolicy);
  if (!parsed.success) return null;
  const parsedMode = programmingExerciseGradingModeSchema.safeParse(
    snapshot.gradingMode === undefined ? "ELICE_STDIO" : snapshot.gradingMode,
  );
  if (!parsedMode.success) return null;
  const mode = parsedMode.data;
  const recorded = snapshot.gradingSemanticVersion === undefined
    ? (mode === "LEGACY_STDIO" ? "legacy-v1" : "elice-v1")
    : snapshot.gradingSemanticVersion;
  if (inputPromptPolicyForSemanticVersion(mode, recorded) !== parsed.data) return null;
  if (mode === "ELICE_STDIO") {
    const policy = gradingPolicySnapshotSchema.safeParse("policy" in snapshot ? snapshot.policy : undefined);
    if (!policy.success || policy.data.semanticVersion !== recorded ||
        (policy.data.inputPromptPolicy ?? "INCLUDE") !== parsed.data) return null;
  }
  return parsed.data;
}
