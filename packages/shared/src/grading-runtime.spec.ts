import { describe, expect, it } from "vitest";
import { brokerRequestSchema, brokerResponseSchema, brokerExecutionInputSchema, brokerExecutionResultSchema, runtimeDescriptorSchema, runtimeManifestSchema } from "./grading-runtime.js";
import { compatibilityFixture, manifestFixture, nativeFixture } from "./testing/grading-runtime-fixtures.js";

describe("immutable grading contracts", () => {
  it("validates complete descriptors and rejects mutable image tags and inconsistent accounting", () => {
    expect(runtimeDescriptorSchema.parse(nativeFixture)).toEqual(nativeFixture);
    expect(Object.isFrozen(runtimeDescriptorSchema.parse(nativeFixture))).toBe(true);
    expect(runtimeDescriptorSchema.safeParse({ ...manifestFixture.compatibility, engineVersion: "pyodide-0.27.5" }).success).toBe(false);
    expect(() => runtimeDescriptorSchema.parse({ ...nativeFixture, imageDigest: "latest" })).toThrow();
    expect(() => runtimeDescriptorSchema.parse({ ...nativeFixture, memoryPolicy: "pyodide-charged-growth-v1" })).toThrow();
  });
  it("rejects duplicate certification keys and certificates for unregistered identities", () => {
    expect(runtimeManifestSchema.safeParse(manifestFixture).success).toBe(true);
    expect(runtimeManifestSchema.safeParse({ ...manifestFixture, certifications: [...manifestFixture.certifications, ...manifestFixture.certifications] }).success).toBe(false);
    expect(runtimeManifestSchema.safeParse({ ...manifestFixture, certifications: [{ ...manifestFixture.certifications[0], runtime: { ...nativeFixture, shimVersion: "other" } }] }).success).toBe(false);
  });
  it.each([
    ["cross-engine", nativeFixture],
    ["same-engine/different-version", Object.freeze({ ...compatibilityFixture, engineVersion: "0.28.0" })],
  ])("rejects a registered %s historical adapter", (_scenario, adapter) => {
    const manifest = { ...manifestFixture,
      historical: [{ engineVersion: "pyodide-0.27.5", adapter }],
      capabilities: { ...manifestFixture.capabilities, runtimes: [...manifestFixture.capabilities.runtimes, ...(adapter.engine === "pyodide" ? [adapter] : [])] },
    };
    const parsed = runtimeManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some(issue => issue.message === "Historical adapter and recorded engine version disagree")).toBe(true);
  });
  it("accepts a matching historical engine/version without requiring recorded image provenance", () => {
    expect(runtimeManifestSchema.parse(manifestFixture).historical).toEqual([
      { engineVersion: "pyodide-0.27.5", adapter: compatibilityFixture },
    ]);
  });
  it("rejects old broker versions, unknown fields and unbounded requests before execution", () => {
    const health = { protocol: 1, type: "health", requestId: "10000000-0000-4000-8000-000000000004" };
    expect(brokerRequestSchema.safeParse(health).success).toBe(true);
    expect(brokerRequestSchema.safeParse({ ...health, protocol: 0 }).success).toBe(false);
    expect(brokerRequestSchema.safeParse({ ...health, code: "print(1)" }).success).toBe(false);
  });
  it("preserves compatibility budgets and effective sub-100ms execution limits", () => {
    const input = { code: "pass", stdin: "", inputPromptPolicy: "IGNORE", timeLimitMs: 1, memoryLimitMb: 4096, outputLimitBytes: 8388608 };
    expect(brokerExecutionInputSchema.safeParse(input).success).toBe(true);
    expect(brokerExecutionInputSchema.safeParse({ ...input, timeLimitMs: 0 }).success).toBe(false);
    expect(brokerExecutionInputSchema.safeParse({ ...input, code: "a".repeat(100001) }).success).toBe(false);
  });
  it("separates execution outcomes from comparison and bounds captured UTF-8 bytes", () => {
    const result = { stdout: "", stderr: "", runtimeMs: 1, outcome: "PASSED", outputTruncated: false };
    expect(brokerExecutionResultSchema.safeParse(result).success).toBe(true);
    expect(brokerExecutionResultSchema.safeParse({ ...result, outcome: "WRONG_OUTPUT" }).success).toBe(false);
    expect(brokerExecutionResultSchema.safeParse({ ...result, stderr: "한".repeat(90000) }).success).toBe(false);
  });
  it("requires independent broker generation and attempt fencing on every control operation", () => {
    const id = "10000000-0000-4000-8000-000000000004";
    const context = { attemptId: id, kind: "submission", caseId: "1", generation: 1, leaseToken: id, workerGeneration: id };
    const base = { protocol: 1, requestId: id, brokerGeneration: id, runtime: nativeFixture, context, reservationId: id };
    for (const type of ["run", "receipt", "ack", "release", "cancel"]) {
      const request = { ...base, type, ...(type === "ack" ? { receiptId: id, checkpointId: id } : {}),
        ...(type === "run" ? { input: { code: "pass", stdin: "", inputPromptPolicy: "INCLUDE", timeLimitMs: 1, memoryLimitMb: 128, outputLimitBytes: 100 } } : {}) };
      expect(brokerRequestSchema.safeParse(request).success).toBe(true);
      expect(brokerRequestSchema.safeParse({ ...request, brokerGeneration: undefined }).success).toBe(false);
      expect(brokerRequestSchema.safeParse({ ...request, context: { ...context, generation: 0 } }).success).toBe(false);
    }
    expect(brokerResponseSchema.safeParse({ ...base, type: "released", cleanup: "uncertain" }).success).toBe(false);
  });
});
