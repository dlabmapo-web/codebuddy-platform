import type { RuntimeDescriptor, RuntimeManifest, RuntimeSelectionContext } from "../grading-runtime.js";

// Deliberately synthetic immutable test identities; never release/image provenance.
export const compatibilityFixture = Object.freeze({
  version: 1, engine: "pyodide", engineVersion: "0.27.5", pythonVersion: "3.12.7",
  platform: "linux", architecture: "amd64", imageDigest: `sha256:${"1".repeat(64)}`,
  packageManifestHash: `sha256:${"2".repeat(64)}`, shimVersion: "test-shim-1",
  memoryPolicy: "pyodide-charged-growth-v1", executionPolicy: "wall-v1",
} satisfies RuntimeDescriptor);
export const nativeFixture = Object.freeze({ ...compatibilityFixture, engine: "cpython",
  engineVersion: "3.12.10", pythonVersion: "3.12.10", imageDigest: `sha256:${"3".repeat(64)}`,
  memoryPolicy: "native-cgroup-growth-v1",
} satisfies RuntimeDescriptor);
export const contextFixture = Object.freeze({
  organizationId: "10000000-0000-4000-8000-000000000001", academyId: "10000000-0000-4000-8000-000000000002",
  materialId: "10000000-0000-4000-8000-000000000003", gradingRevision: 1, context: "live",
  memoryLimitMb: 128, timeLimitMs: 1000,
} satisfies RuntimeSelectionContext);
export const manifestFixture = Object.freeze({
  version: 1, compatibility: compatibilityFixture, native: nativeFixture,
  academyAllowances: Object.freeze([Object.freeze({ organizationId: contextFixture.organizationId, academyId: contextFixture.academyId })]),
  certifications: Object.freeze([Object.freeze({ ...contextFixture, runtime: nativeFixture, packageProfile: "standard-library" })]),
  historical: Object.freeze([Object.freeze({ engineVersion: "pyodide-0.27.5", adapter: compatibilityFixture })]),
  capabilities: Object.freeze({ version: 1, protocol: 1, runtimes: Object.freeze([compatibilityFixture, nativeFixture]),
    nativeMemoryPolicy: "native-cgroup-growth-v1", maxActive: 2, maxBackground: 1, maxSpare: 1,
    nativeProfile: Object.freeze({ packageProfile: "standard-library", pythonFamily: "3.12", memoryLimitMb: Object.freeze({ min: 32, max: 256 }), timeLimitMs: Object.freeze({ min: 100, max: 60000 }) }),
    compatibilityProfile: Object.freeze({ memoryLimitMb: Object.freeze({ min: 16, max: 4096 }), timeLimitMs: Object.freeze({ min: 1, max: 60000 }) }),
    codeChars: 100000, stdinChars: 8388608, stdoutBytes: 8388608, stderrBytes: 262144,
  }),
} satisfies RuntimeManifest);
