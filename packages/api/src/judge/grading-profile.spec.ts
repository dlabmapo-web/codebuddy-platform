import { describe, expect, it } from "vitest";
import { legacyCaseGrading, defaultEliceGradingProfile } from "@cove/shared";
import { exerciseProfileColumns, gradingPolicySnapshotSchema, gradingSnapshotFor, resolveGradingProfile, type ExerciseGradingSource } from "./grading-profile.js";
import { sampleInputPromptPolicy, sampleSnapshotFor } from "./sample-check-snapshot.js";

const sample = { ...legacyCaseGrading, input: "4\n30\n", expectedOutput: "현재 4시 30분입니다.", visibility: "SAMPLE" as const, label: null };
function exercise(enhanced: boolean, ignore: boolean): ExerciseGradingSource {
  return { ...exerciseProfileColumns({ ...defaultEliceGradingProfile, mode: enhanced ? "ELICE_STDIO" : "LEGACY_STDIO", inputPromptPolicy: ignore ? "IGNORE" : "INCLUDE" }),
    gradingSemanticVersion: enhanced ? (ignore ? "elice-v2" : "elice-v1") : (ignore ? "legacy-v2" : "legacy-v1"),
    timeLimitMs: 3000, memoryLimitMb: 256, testCases: [sample] };
}

describe("snapshotted input prompt semantics", () => {
  it.each([false, true])("freezes policy for submission and sample, enhanced=%s", (enhanced) => {
    const source = exercise(enhanced, true);
    const frozen = gradingSnapshotFor(source, { engineVersion: "0.27.5" });
    const check = sampleSnapshotFor(source, sample, "print(input('prompt'))", "0.27.5")!;
    source.inputPromptPolicy = "INCLUDE";
    expect(frozen.submission.inputPromptPolicy).toBe("IGNORE");
    expect(sampleInputPromptPolicy(check)).toBe("IGNORE");
    const resolved = resolveGradingProfile(frozen.submission, frozen.cases, frozen.submission.gradingPolicySnapshot);
    expect(resolved).toMatchObject({ kind: enhanced ? "elice" : "legacy", inputPromptPolicy: "IGNORE" });
    if (enhanced) expect(frozen.submission.gradingPolicySnapshot).toMatchObject({ version: 3, inputPromptPolicy: "IGNORE", semanticVersion: "elice-v2" });
    expect(resolveGradingProfile({ ...source, gradingSemanticVersion: enhanced ? "elice-v2" : "legacy-v2" }, source.testCases)).toMatchObject({ kind: "unsupported" });
  });

  it("retains old snapshots and rejects inconsistent versions and unknown policies", () => {
    const old = gradingSnapshotFor(exercise(true, false), { engineVersion: "0.27.5" });
    const policy = old.submission.gradingPolicySnapshot!;
    expect(gradingPolicySnapshotSchema.safeParse({ ...policy, version: 1 }).success).toBe(true);
    expect(gradingPolicySnapshotSchema.safeParse({ ...policy, version: 3 }).success).toBe(false);
    expect(gradingPolicySnapshotSchema.safeParse({ ...policy, inputPromptPolicy: "IGNORE" }).success).toBe(false);
    expect(resolveGradingProfile({ ...exercise(false, false), inputPromptPolicy: "future" as never }, [sample])).toMatchObject({ kind: "unsupported" });
    const historical = sampleSnapshotFor(exercise(false, false), sample, "", "0.27.5")!;
    delete historical.inputPromptPolicy;
    delete historical.gradingSemanticVersion;
    expect(sampleInputPromptPolicy(historical)).toBe("INCLUDE");
    expect(sampleInputPromptPolicy({ ...historical, inputPromptPolicy: "IGNORE" })).toBeNull();
    expect(sampleInputPromptPolicy({ ...historical, gradingSemanticVersion: "legacy-v99" })).toBeNull();
  });
});
