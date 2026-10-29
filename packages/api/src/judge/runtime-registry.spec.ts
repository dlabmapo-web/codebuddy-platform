import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compatibilityFixture, contextFixture, manifestFixture, nativeFixture } from "../../../shared/src/testing/grading-runtime-fixtures.js";
import { createRuntimeRegistry, loadRuntimeManifest, parseRuntimeManifest, selectRuntime } from "./runtime-registry.js";

describe("runtime selection and provenance", () => {
  it("keeps native disabled and uncertified revisions on compatibility", () => {
    expect(selectRuntime({ enabled: false, manifest: manifestFixture, context: contextFixture })).toEqual(manifestFixture.compatibility);
    expect(selectRuntime({ enabled: true, manifest: manifestFixture, context: { ...contextFixture, gradingRevision: 2 } })).toEqual(manifestFixture.compatibility);
    expect(selectRuntime({ enabled: true, manifest: manifestFixture, context: contextFixture })).toEqual(nativeFixture);
  });
  it("isolates organization, academy UUID, context and supported budgets", () => {
    for (const context of [
      { ...contextFixture, organizationId: "20000000-0000-4000-8000-000000000001" },
      { ...contextFixture, academyId: "20000000-0000-4000-8000-000000000001" },
      { ...contextFixture, context: "preview" as const },
      { ...contextFixture, memoryLimitMb: 512 }, { ...contextFixture, timeLimitMs: 99 },
    ]) expect(selectRuntime({ enabled: true, manifest: manifestFixture, context })).toEqual(compatibilityFixture);
  });
  it("loads independent deeply frozen manifests, never recording invented historical provenance", () => {
    const manifest = parseRuntimeManifest(JSON.stringify(manifestFixture));
    expect(Object.isFrozen(manifest.certifications[0]?.runtime)).toBe(true);
    const registry = createRuntimeRegistry({ enabled: true, manifest, clientFactory: descriptor => ({ version: `${descriptor.engine}-${descriptor.engineVersion}`, descriptor }) });
    expect(registry.selectRuntime(contextFixture)).toEqual(nativeFixture);
    expect(registry.selectRuntime({ ...contextFixture, gradingRevision: 2 })).toEqual(compatibilityFixture);
    expect(registry.resolveHistoricalRuntime({ engineVersion: "pyodide-0.27.5" })).toEqual({ provenance: "unrecorded", engineVersion: "pyodide-0.27.5", adapter: compatibilityFixture });
    expect(() => registry.resolveHistoricalRuntime({ engineVersion: "pyodide-unknown" })).toThrow(/Unknown historical/);
    const native = registry.bindEngine(nativeFixture), compatibility = registry.bindEngine(compatibilityFixture);
    expect(native.version).toBe("cpython-3.12.10"); expect(compatibility.version).toBe("pyodide-0.27.5");
    expect(() => registry.bindEngine({ ...nativeFixture, shimVersion: "absent" })).toThrow();
  });
  it("rejects descriptor drift at historical resolution and factory binding", () => {
    const registry = createRuntimeRegistry({ enabled: false, manifest: manifestFixture, clientFactory: descriptor => Object.freeze({ version: `${descriptor.engine}-${descriptor.engineVersion}`, descriptor }) });
    expect(registry.resolveHistoricalRuntime({ engineVersion: "cpython-3.12.10", executionRuntimeSnapshot: nativeFixture })).toEqual({ provenance: "recorded", descriptor: nativeFixture });
    expect(() => registry.resolveHistoricalRuntime({ engineVersion: "pyodide-0.27.5", executionRuntimeSnapshot: nativeFixture })).toThrow(/disagree/);
    expect(() => registry.resolveHistoricalRuntime({ engineVersion: "cpython-3.12.10", executionRuntimeSnapshot: { ...nativeFixture, shimVersion: "unknown" } })).toThrow();
    const client = registry.bindEngine(nativeFixture);
    expect(Object.isFrozen(client)).toBe(true);
    expect(client.descriptor).toEqual(nativeFixture);
    expect(() => Reflect.set(client, "version", "changed")).toThrow();
    const bad = createRuntimeRegistry({ enabled: false, manifest: manifestFixture, clientFactory: descriptor => ({ version: `${descriptor.engine}-${descriptor.engineVersion}`, descriptor: { ...descriptor, shimVersion: "wrong" } }) });
    expect(() => bad.bindEngine(nativeFixture)).toThrow(/mismatched runtime identity/);
  });
  it("loads one immutable bounded file snapshot without hot-reloading later edits", async () => {
    const directory = await mkdtemp(join(tmpdir(), "grading-manifest-"));
    try {
      const path = join(directory, "manifest.json");
      await writeFile(path, JSON.stringify(manifestFixture));
      const loaded = await loadRuntimeManifest(path);
      await writeFile(path, "{}");
      expect(loaded).toEqual(manifestFixture);
      expect(Object.isFrozen(loaded.capabilities.nativeProfile)).toBe(true);
      await expect(loadRuntimeManifest(path)).rejects.toThrow();
      await expect(loadRuntimeManifest("relative.json")).rejects.toThrow(/absolute/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
