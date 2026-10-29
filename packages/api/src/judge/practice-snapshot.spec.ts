import { describe, expect, it } from "vitest";
import { practiceSnapshotSchema } from "./practice-snapshot.js";
import { nativeFixture } from "../../../shared/src/testing/grading-runtime-fixtures.js";

const historical = {
  version: 1, gradingRevision: 1, timeLimitMs: 1000, memoryLimitMb: 128, inputPromptPolicy: "INCLUDE",
  gradingMode: "LEGACY_STDIO", gradingSemanticVersion: "legacy-v1", totalTimeLimitMs: null,
  comparatorTimeLimitMs: null, continuationPolicy: "LEGACY_STOP_ON_RESOURCE", exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR",
  materialMaximumHundredths: null, materialScorePolicy: null, quizSnapshot: null, gradingCases: [],
};
describe("versioned practice runtime", () => {
  it("reads historical v1 results and requires recorded provenance for v2", () => {
    expect(practiceSnapshotSchema.safeParse(historical).success).toBe(true);
    expect(practiceSnapshotSchema.safeParse({ ...historical, version: 2 }).success).toBe(false);
    expect(practiceSnapshotSchema.safeParse({ ...historical, version: 2, executionRuntimeSnapshot: nativeFixture }).success).toBe(true);
    expect(practiceSnapshotSchema.safeParse({ ...historical, version: 9, executionRuntimeSnapshot: nativeFixture }).success).toBe(false);
  });
});
