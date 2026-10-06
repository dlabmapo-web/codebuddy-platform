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
