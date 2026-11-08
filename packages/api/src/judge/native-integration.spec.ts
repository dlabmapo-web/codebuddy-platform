import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NativeAdmission, frozenNativeDescriptor, loadNativeManifest } from "./native-admission.js";
import { NativeJobGate, nativeBackgroundCapable } from "./native-job-gate.js";
import { nativeWorkerEnvironmentSchema } from "./native-worker.js";
import { gradingPolicySnapshotSchema, gradingSnapshotFor, runtimeMismatch } from "./grading-profile.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";
import { runtimeQueueName } from "./judge.queue.js";
import { sampleSnapshotFor } from "./sample-check-snapshot.js";
import { manifest as fixture } from "../../../grading-runtime/test/fixtures.js";
import { legacyCaseGrading, nativeReleaseManifestSchema } from "@cove/shared";
import { nativeRuntimeVersion } from "@cove/grading-runtime";

const id = "10000000-0000-4000-8000-000000000001";
const exercise = { gradingMode: "ELICE_STDIO" as const, gradingSemanticVersion: "elice-v1", inputPromptPolicy: "INCLUDE" as const,
  totalTimeLimitMs: 60_000, comparatorTimeLimitMs: 100, continuationPolicy: "CONTINUE_WITHIN_BUDGET" as const,
  exitStatusPolicy: "FAIL_ON_RUNTIME_ERROR" as const, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL" as const,
  memoryLimitMb: 128, timeLimitMs: 1000, testCases: [{ ...legacyCaseGrading, visibility: "SAMPLE" as const, input: "", expectedOutput: "ok", label: null }] };
const context = { academyId: id, materialId: id, gradingRevision: 1, context: "live" as const, kind: "official" as const };
let directory: string, path: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "cove-native-contract-")); path = join(directory, "manifest.json");
  await writeFile(path, JSON.stringify({ ...fixture, eligibility: [{ ...context, organizationId: id, kinds: ["official", "staff-practice", "sample", "regrade"], memoryLimitMb: 128, timeLimitMs: 1000, kind: undefined }] }));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

function admission(settings: Record<string, unknown> = {}, ready = 1) {
  const redis = { eval: vi.fn().mockResolvedValue(ready) };
  const config = new ConfigService({ NATIVE_GRADING_ENABLED: true, NATIVE_GRADING_BRIDGE_ACK: "filtered-compatibility-workers-v1", NATIVE_GRADING_MANIFEST: path, ...settings });
  return { config, redis, admission: new NativeAdmission(config, { academy: { findUnique: async () => ({ organizationId: id }) } } as never, { redis: async () => redis } as never) };
}
describe("native admission and immutable contracts", () => {
  it("defaults off and requires bridge acknowledgement and verified lane readiness", async () => {
    expect(await admission({ NATIVE_GRADING_ENABLED: undefined }).admission.select(context, exercise)).toBeNull();
    await expect(admission({ NATIVE_GRADING_BRIDGE_ACK: undefined }).admission.select(context, exercise)).rejects.toThrow("rollout");
    expect(await admission({}, 0).admission.select(context, exercise)).toBeNull();
    expect(await admission().admission.select(context, exercise)).toEqual(fixture.descriptor);
  });
  it.each([
    ["revision", { ...context, gradingRevision: 2 }, exercise],
    ["academy", { ...context, academyId: "20000000-0000-4000-8000-000000000001" }, exercise],
    ["preview", { ...context, context: "preview" as const }, exercise],
    ["memory", context, { ...exercise, memoryLimitMb: 256 }],
    ["higher class", context, { ...exercise, memoryLimitMb: 1024 }],
    ["case override", context, { ...exercise, testCases: [{ ...exercise.testCases[0]!, timeLimitMsOverride: 2000 }] }],
    ["case count", context, { ...exercise, testCases: Array.from({ length: 11 }, () => exercise.testCases[0]!) }],
  ])("keeps uncertified %s on compatibility admission", async (_, candidate, authored) => {
    expect(await admission().admission.select(candidate, authored)).toBeNull();
  });
  it("admits every exercise of a scope within the node's limits, across edits and large tests", async () => {
    const scopePath = join(directory, "scope-manifest.json");
    const academyScope = { organizationId: id, academyId: id, contexts: ["live"], kinds: ["official", "sample"], maxCaseTimeLimitMs: 5000 };
    await writeFile(scopePath, JSON.stringify({ ...fixture, eligibility: [academyScope] }));
    const scoped = admission({ NATIVE_GRADING_MANIFEST: scopePath }).admission;
    const large = { ...exercise, memoryLimitMb: 512, timeLimitMs: 3000,
      testCases: Array.from({ length: 40 }, () => ({ ...exercise.testCases[0]!, input: "1 ".repeat(50_000) })) };
    const anotherMaterial = { ...context, materialId: "30000000-0000-4000-8000-000000000001", gradingRevision: 7 };
    expect(await scoped.select(anotherMaterial, large)).toEqual(fixture.descriptor);
    expect(await scoped.select({ ...anotherMaterial, kind: "sample" }, exercise)).toEqual(fixture.descriptor);
    expect(await scoped.retain(fixture.descriptor, anotherMaterial, large)).toEqual(fixture.descriptor);
    for (const [candidate, authored] of [
      [{ ...anotherMaterial, academyId: "20000000-0000-4000-8000-000000000001" }, exercise],
      [{ ...anotherMaterial, context: "preview" as const }, exercise],
      [{ ...anotherMaterial, kind: "regrade" as const }, exercise],
      [anotherMaterial, { ...exercise, memoryLimitMb: 1024 }],
      [anotherMaterial, { ...exercise, testCases: [{ ...exercise.testCases[0]!, timeLimitMsOverride: 5001 }] }],
      [anotherMaterial, { ...exercise, testCases: [] }],
    ] as const) expect(await scoped.select(candidate, authored)).toBeNull();
    // Without an academy the scope is the organization: any of its academies qualifies.
    const { academyId: _, ...organizationScope } = academyScope;
    await writeFile(scopePath, JSON.stringify({ ...fixture, eligibility: [organizationScope] }));
    const organization = admission({ NATIVE_GRADING_MANIFEST: scopePath }).admission;
    expect(await organization.select({ ...anotherMaterial, academyId: "20000000-0000-4000-8000-000000000001" }, exercise)).toEqual(fixture.descriptor);
    expect(nativeReleaseManifestSchema.safeParse({ ...fixture, eligibility: [{ ...academyScope, contexts: [] }] }).success).toBe(false);
    expect(nativeReleaseManifestSchema.safeParse({ ...fixture, eligibility: [{ ...academyScope, materialId: id }] }).success).toBe(false);
  });
  it("admits every academy of the platform, follows a replaced manifest and falls back while it is missing", async () => {
    const livePath = join(directory, "live-manifest.json");
    const platform = { contexts: ["live", "preview"], kinds: ["official", "staff-practice", "sample", "regrade"], maxCaseTimeLimitMs: 60_000 };
    const live = admission({ NATIVE_GRADING_MANIFEST: livePath }).admission;
    // Before the node has published its manifest, new work stays on compatibility grading.
    expect(await live.select(context, exercise)).toBeNull();
    await writeFile(livePath, JSON.stringify({ ...fixture, eligibility: [platform] }));
    const elsewhere = { ...context, academyId: "20000000-0000-4000-8000-000000000001", materialId: "30000000-0000-4000-8000-000000000001" };
    expect(await live.select(elsewhere, exercise)).toEqual(fixture.descriptor);
    // A node release rewrites the manifest; admission follows its new runtime.
    const next = { ...fixture.descriptor, pythonVersion: "3.12.13" };
    await writeFile(livePath, JSON.stringify({ ...fixture, descriptor: next, eligibility: [platform] }));
    expect(await live.select(elsewhere, exercise)).toEqual(next);
    await rm(livePath);
    expect(await live.select(elsewhere, exercise)).toBeNull();
    expect(nativeReleaseManifestSchema.safeParse({ ...fixture, eligibility: [{ ...platform, academyId: id }] }).success).toBe(false);
  });
  it("loads one immutable bounded manifest and refuses malformed explicit identities", async () => {
    const loaded = await loadNativeManifest(path); expect(Object.isFrozen(loaded.descriptor.comparator)).toBe(true);
    expect(frozenNativeDescriptor(null)).toBeNull(); expect(() => frozenNativeDescriptor({ engine: "pyodide" })).toThrow();
    const overflow = join(directory, "overflow.json"); await writeFile(overflow, " ".repeat(4 * 1024 * 1024 + 1));
    await expect(loadNativeManifest(overflow)).rejects.toThrow("limit");
  });
  it("certifies authored per-case timeouts separately from the unchanged exercise default", async () => {
    const overridePath = join(directory, "case-timeout-manifest.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    manifest.eligibility[0].maxCaseTimeLimitMs = 2000;
    await writeFile(overridePath, JSON.stringify(manifest));
    const authored = { ...exercise, testCases: [{ ...exercise.testCases[0]!, timeLimitMsOverride: 2000 }] };
    const certified = admission({ NATIVE_GRADING_MANIFEST: overridePath });
    expect(await certified.admission.select(context, authored)).toEqual(fixture.descriptor);
    expect(gradingSnapshotFor(authored, { engineVersion: "0.27.5", descriptor: fixture.descriptor }).cases[0]!.timeLimitMsOverride).toBe(2000);
    expect(authored.timeLimitMs).toBe(1000);
    expect(await certified.admission.select(context, { ...authored, testCases: [{ ...authored.testCases[0]!, timeLimitMsOverride: 2001 }] })).toBeNull();
    expect(await admission().admission.select(context, authored)).toBeNull();
    expect(await certified.admission.retain(fixture.descriptor, context, authored)).toEqual(fixture.descriptor);
    manifest.eligibility[0].maxCaseTimeLimitMs = 999;
    expect(nativeReleaseManifestSchema.safeParse(manifest).success).toBe(false);
  });
  it("preserves historical v1/v2/v3 and explicit v4 native identity, including legacy practice/sample", () => {
    const historical = gradingSnapshotFor(exercise, { engineVersion: "0.27.5" }).submission.gradingPolicySnapshot!;
    for (const version of [1, 2, 3]) {
      const policy = { ...historical, version, ...(version === 3 ? { semanticVersion: "elice-v2", inputPromptPolicy: "IGNORE" } : {}) };
      expect(gradingPolicySnapshotSchema.safeParse(policy).success).toBe(true);
    }
    const native = gradingSnapshotFor(exercise, { engineVersion: "0.27.5", descriptor: fixture.descriptor });
    expect(native.submission.gradingPolicySnapshot?.version).toBe(4);
    expect(runtimeMismatch(native.submission.gradingPolicySnapshot!, { engine: nativeRuntimeVersion(fixture.descriptor), comparator: `pyodide-${fixture.descriptor.comparator.version}` })).toBeNull();
    const legacy = { ...exercise, gradingMode: "LEGACY_STDIO" as const, gradingSemanticVersion: "legacy-v1", continuationPolicy: "LEGACY_STOP_ON_RESOURCE" as const,
      totalTimeLimitMs: null, comparatorTimeLimitMs: null, materialMaximumHundredths: null, materialScorePolicy: null };
    const snapshot = gradingSnapshotFor(legacy, { engineVersion: "0.27.5", descriptor: fixture.descriptor });
    expect(snapshot.submission.executionRuntimeSnapshot).toEqual(fixture.descriptor);
    expect(practiceSnapshotSchema.parse({ version: 1, gradingRevision: 1, timeLimitMs: 1000, memoryLimitMb: 128, quizSnapshot: null,
      ...snapshot.submission, gradingCases: snapshot.cases }).executionRuntimeSnapshot).toEqual(fixture.descriptor);
    expect(sampleSnapshotFor(legacy, legacy.testCases[0]!, "", "0.27.5", fixture.descriptor)?.executionRuntimeSnapshot).toEqual(fixture.descriptor);
  });
  it("separates every queue and the complete release fingerprint", () => {
    const changed = { ...fixture.descriptor, comparator: { ...fixture.descriptor.comparator, semanticsVersion: "changed" } };
    for (const kind of ["official", "practice", "sample", "regrade"] as const) {
      expect(runtimeQueueName(kind, fixture.descriptor)).toMatch(/-native-v1-[a-f0-9]{64}$/);
      expect(runtimeQueueName(kind, fixture.descriptor)).not.toBe(runtimeQueueName(kind, changed));
      expect(runtimeQueueName(kind)).not.toBe(runtimeQueueName(kind, fixture.descriptor));
    }
  });
});
describe("native node bounds", () => {
  it("reserves official slots while background work waits, without changing authored memory", async () => {
    const gate = new NativeJobGate(fixture.resources);
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    let background2 = false, official = false;
    const first = gate.run(512, "background", () => held);
    const second = gate.run(512, "background", async () => { background2 = true; });
    await gate.run(512, "official", async () => { official = true; });
    expect(official).toBe(true); expect(background2).toBe(false);
    release(); await Promise.all([first, second]); expect(background2).toBe(true);
    await expect(gate.run(1024, "official", async () => undefined)).rejects.toThrow("capacity");
    await expect(gate.run(NaN, "official", async () => undefined)).rejects.toThrow("capacity");
  });
  it("does not consume background work when a node cannot support the maximum classroom class", () => {
    expect(nativeBackgroundCapable(fixture.resources)).toBe(true);
    expect(nativeBackgroundCapable({ ...fixture.resources, officialReservedSlots: 2 })).toBe(false);
    expect(() => new NativeJobGate({ ...fixture.resources, maxCaseMemoryMb: 128 })).toThrow("512");
  });
  it("validates focused worker secrets and fleet pool arithmetic", () => {
    const env = { JUDGE_RUNTIME_FAMILY: "native", NATIVE_GRADING_MANIFEST: "/manifest.json", NATIVE_GRADING_SOCKET: "/launcher.sock",
      DATABASE_URL: "postgresql://fixture@127.0.0.1/fixture", REDIS_URL: "redis://127.0.0.1", DATABASE_CONNECTION_BUDGET: 10,
      DATABASE_API_POOL_BUDGET: 4, DATABASE_OPERATIONAL_RESERVE: 2, JUDGE_FLEET_WORKER_COUNT: 2 };
    expect(nativeWorkerEnvironmentSchema.safeParse(env).success).toBe(true);
    expect(nativeWorkerEnvironmentSchema.safeParse({ ...env, DATABASE_POOL_MAX: 3 }).success).toBe(false);
    expect(nativeWorkerEnvironmentSchema.safeParse({ ...env, JUDGE_RUNTIME_FAMILY: "pyodide" }).success).toBe(false);
  });
});
