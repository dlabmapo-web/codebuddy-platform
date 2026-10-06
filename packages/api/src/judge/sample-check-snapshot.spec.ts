import { describe, expect, it } from "vitest";
import { legacyCaseGrading } from "@cove/shared";
import { sampleSnapshotFor } from "./sample-check-snapshot.js";
import type { ExerciseGradingSource } from "./grading-profile.js";

const sample = { ...legacyCaseGrading, input: "6", expectedOutput: "4", visibility: "SAMPLE" as const, label: null };
const exercise: ExerciseGradingSource = {
  gradingMode: "LEGACY_STDIO", gradingSemanticVersion: "legacy-v1",
  totalTimeLimitMs: null, comparatorTimeLimitMs: null,
  continuationPolicy: "LEGACY_STOP_ON_RESOURCE", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
  materialMaximumHundredths: null, materialScorePolicy: null,
  timeLimitMs: 3000, memoryLimitMb: 256,
  testCases: [sample, { ...sample, visibility: "HIDDEN", input: "PRIVATE_INPUT", expectedOutput: "PRIVATE_EXPECTED" }],
};

describe("legacy sample admission snapshot", () => {
  it("freezes Submit's execution limits and only the selected public case", () => {
    const result = sampleSnapshotFor(exercise, sample, "print(4)", "0.27.5");
    expect(result).toMatchObject({ gradingMode: "LEGACY_STDIO", engineVersion: "pyodide-0.27.5", memoryLimitMb: 256, testCase: { caseLimitMs: 3000, input: "6", expectedOutput: "4" } });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(result).not.toHaveProperty("policy");
  });
  it("refuses hidden selections and invalid legacy definitions", () => {
    expect(sampleSnapshotFor(exercise, exercise.testCases[1]!, "", "0.27.5")).toBeNull();
    expect(sampleSnapshotFor({ ...exercise, gradingSemanticVersion: "future" }, sample, "", "0.27.5")).toBeNull();
    expect(sampleSnapshotFor({ ...exercise, testCases: [{ ...sample, weight: 2 }] }, sample, "", "0.27.5")).toBeNull();
  });
});
