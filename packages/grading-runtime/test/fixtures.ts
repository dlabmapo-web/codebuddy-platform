import type { NativeReleaseManifest } from "@cove/shared";
import { NSJAIL_REVISION } from "../src/policy.js";
const digest = `sha256:${"1".repeat(64)}`;
export const manifest: NativeReleaseManifest = {
  schemaVersion: 1,
  descriptor: {
    schemaVersion: 1,
    engine: "native-cpython",
    pythonVersion: "3.12.12",
    architecture: "arm64",
    rootfsDigest: digest,
    packageManifestDigest: digest,
    nsjailRevision: NSJAIL_REVISION,
    nsjailBinaryDigest: digest,
    sandboxPolicyVersion: "nsjail-cpython-v1",
    sandboxPolicyDigest: digest,
    guestBootstrapDigest: digest,
    comparator: {
      engine: "pyodide",
      version: "0.28.3",
      packageDigest: digest,
      semanticsVersion: "stdio-v1",
    },
  },
  resources: {
    physicalMemoryMb: 4096,
    envelopeMemoryMb: 2048,
    serviceOverheadMb: 256,
    caseOverheadMb: 128,
    cpuSlots: 2,
    officialReservedSlots: 1,
    officialReservedMemoryMb: 768,
    maxCaseMemoryMb: 512,
    maxCasePids: 8,
    scratchMb: 16,
  },
  eligibility: [],
};
export const request = {
  code: "print(1)",
  stdin: "",
  timeLimitMs: 1000,
  memoryLimitMb: 128,
};
export const result = {
  stdout: "1\n",
  stderr: "",
  outcome: "PASSED" as const,
  runtimeMs: 1,
};
