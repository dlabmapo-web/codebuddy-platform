import { executionEngineVersion, runtimeDescriptorSchema, runtimeDescriptorIdentity, inputPromptPolicySchema, programmingExerciseGradingModeSchema, inputPromptPolicyForSemanticVersion, type InputPromptPolicy } from "@cove/shared";
import type { ExerciseGradingSource } from "./grading-profile.js";
import { gradingSnapshotFor, gradingPolicySnapshotSchema, resolveGradingProfile } from "./grading-profile.js";
import type { SampleSnapshot } from "./sample-check.store.js";

/** Admission freezes one public case, using the same profile validation as Submit. */
export function sampleSnapshotFor(
  exercise: ExerciseGradingSource,
  testCase: ExerciseGradingSource["testCases"][number],
  code: string,
  engineVersion: string,
): SampleSnapshot | null {
  const profile = resolveGradingProfile(exercise, exercise.testCases);
  if (profile.kind === "unsupported" || testCase.visibility !== "SAMPLE") return null;
  if (profile.kind === "legacy") {
    return {
      inputPromptPolicy: profile.inputPromptPolicy,
      gradingSemanticVersion: exercise.gradingSemanticVersion,
      gradingMode: "LEGACY_STDIO",
      engineVersion: `pyodide-${engineVersion}`,
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
  const snapshot = gradingSnapshotFor({ ...exercise, testCases: [testCase] }, { engineVersion });
  const selected = snapshot.cases[0]!;
  return {
    inputPromptPolicy: profile.inputPromptPolicy,
    gradingSemanticVersion: exercise.gradingSemanticVersion,
    code,
    memoryLimitMb: exercise.memoryLimitMb,
    totalTimeLimitMs: profile.totalTimeLimitMs,
    comparatorTimeLimitMs: profile.comparatorTimeLimitMs,
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

/** Historical Redis records lack both fields. New semantics must be explicit. */
export function sampleInputPromptPolicy(snapshot: SampleSnapshot): InputPromptPolicy | null {
  if (snapshot.version !== undefined && snapshot.version !== 1 && snapshot.version !== 2) return null;
  if (snapshot.version === 2) {
    const runtime = runtimeDescriptorSchema.safeParse(snapshot.executionRuntimeSnapshot);
    if (!runtime.success) return null;
    if (snapshot.gradingMode === "LEGACY_STDIO" && snapshot.engineVersion !== executionEngineVersion(runtime.data)) return null;
    if ("policy" in snapshot) {
      const policy = gradingPolicySnapshotSchema.safeParse(snapshot.policy);
      if (!policy.success || policy.data.version !== 4 || runtimeDescriptorIdentity(policy.data.runtime) !== runtimeDescriptorIdentity(runtime.data)) return null;
    }
  }
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
