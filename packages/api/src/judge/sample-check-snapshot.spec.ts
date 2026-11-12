import { describe, expect, it } from "vitest";
import { legacyCaseGrading, type NativeGccDescriptor } from "@cove/shared";
import { runExerciseFor, runSnapshotFor, sampleInputPromptPolicy, sampleSnapshotFor } from "./sample-check-snapshot.js";
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

const digest = `sha256:${"1".repeat(64)}`;
const gcc: NativeGccDescriptor = {
  schemaVersion: 1,
  engine: "native-gcc",
  gccVersion: "12.2.0",
  architecture: "arm64",
  toolchainRootfsDigest: digest,
  runRootfsDigest: digest,
  packageManifestDigest: digest,
  compile: { C: { argv: ["/usr/bin/gcc-12"] }, CPP: { argv: ["/usr/bin/g++-12"], pchDigest: digest } },
  nsjailRevision: "d8415bc8eea43cdd413daba25af63127019a1189",
  nsjailBinaryDigest: digest,
  sandboxPolicyVersion: "nsjail-gcc-v1",
  compilePolicyDigest: digest,
  runPolicyDigest: digest,
  execGateDigest: digest,
  comparator: { engine: "pyodide", version: "0.27.5", packageDigest: digest, semanticsVersion: "cove-python-comparator-v1" },
};
describe('manual compiled Run', () => {
  it.each(['C','CPP'] as const)('executes %s with no authored tests or automatic grading profile',language=>{
    const source={...exercise,language,submissionPolicy:'MANUAL_REVIEW' as const,testCases:[]};
    const selected=runExerciseFor(source,'student input');
    expect(selected.testCases).toHaveLength(1);
    expect(source.testCases).toHaveLength(0);
    const snapshot=runSnapshotFor(source,'student input','student code','0.27.5',gcc);
    expect(snapshot).toMatchObject({run:true,language,gradingSemanticVersion:'elice-v1',testCase:{input:'student input',expectedOutput:''}});
    expect(sampleInputPromptPolicy(snapshot!)).toBe('INCLUDE');
  });
  it('keeps refusing invalid automatic profiles',()=>{
    expect(runSnapshotFor({...exercise,language:'C',testCases:[]},'','','0.27.5',gcc)).toBeNull();
  });
});
