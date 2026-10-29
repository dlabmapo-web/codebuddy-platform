import { open } from "node:fs/promises";
import {
  executionEngineVersion, runtimeCertificationKey, runtimeDescriptorIdentity, runtimeDescriptorSchema,
  runtimeManifestSchema, runtimeSelectionContextSchema,
  type HistoricalRuntimeResolution, type RuntimeCertification, type RuntimeDescriptor, type RuntimeManifest, type RuntimeSelectionContext,
} from "@cove/shared";

const MANIFEST_MAX_BYTES = 16 * 1024 * 1024;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Parses a copy, validates cross-references and freezes every nested value. */
export function parseRuntimeManifest(json: string): RuntimeManifest {
  if (Buffer.byteLength(json, "utf8") > MANIFEST_MAX_BYTES) throw new Error("Runtime manifest exceeds limit");
  return freeze(runtimeManifestSchema.parse(JSON.parse(json)));
}
/** Load once at startup; callers retain this immutable value for their generation. */
export async function loadRuntimeManifest(path: string): Promise<RuntimeManifest> {
  if (!path.startsWith("/")) throw new Error("Runtime manifest path must be absolute");
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MANIFEST_MAX_BYTES) throw new Error("Runtime manifest must be a bounded regular file");
    const buffer = Buffer.alloc(MANIFEST_MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    return parseRuntimeManifest(buffer.subarray(0, size).toString("utf8"));
  } finally { await handle.close(); }
}
function selectValidatedRuntime(enabled: boolean, manifest: RuntimeManifest, context: RuntimeSelectionContext,
  certifications: ReadonlyMap<string, RuntimeCertification>): RuntimeDescriptor {
  const native = manifest.native;
  if (!enabled || !native) return manifest.compatibility;
  // Manifest validation already proves each certificate's allowance ownership.
  const certificate = certifications.get(runtimeCertificationKey(context));
  if (!certificate || certificate.memoryLimitMb !== context.memoryLimitMb || certificate.timeLimitMs !== context.timeLimitMs ||
      context.memoryLimitMb < 32 || context.memoryLimitMb > 256 || context.timeLimitMs < 100 || context.timeLimitMs > 60000)
    return manifest.compatibility;
  return native;
}
export function selectRuntime(options: { enabled: boolean; manifest: RuntimeManifest; context: RuntimeSelectionContext }): RuntimeDescriptor {
  const context = runtimeSelectionContextSchema.parse(options.context);
  const manifest = freeze(runtimeManifestSchema.parse(options.manifest));
  return selectValidatedRuntime(options.enabled, manifest, context,
    new Map(manifest.certifications.map(certificate => [runtimeCertificationKey(certificate), certificate])));
}
export type HistoricalRuntimeWork = { executionRuntimeSnapshot?: unknown; engineVersion: string };
export type DescriptorBoundClient<T> = Readonly<T & { descriptor: RuntimeDescriptor; version: string }>;
export interface RuntimeRegistry<T extends { readonly version: string; readonly descriptor: RuntimeDescriptor }> {
  readonly manifest: RuntimeManifest;
  selectRuntime(context: RuntimeSelectionContext): RuntimeDescriptor;
  resolveHistoricalRuntime(work: HistoricalRuntimeWork): HistoricalRuntimeResolution;
  bindEngine(descriptor: RuntimeDescriptor): DescriptorBoundClient<T>;
}
/** Factories create per-attempt clients; no singleton mutable engine/version state. */
export function createRuntimeRegistry<T extends { readonly version: string; readonly descriptor: RuntimeDescriptor }>(options: {
  enabled: boolean; manifest: RuntimeManifest; clientFactory: (descriptor: RuntimeDescriptor) => T;
}): RuntimeRegistry<T> {
  const manifest = parseRuntimeManifest(JSON.stringify(options.manifest));
  const enabled = options.enabled, clientFactory = options.clientFactory;
  const certifications = new Map(manifest.certifications.map(certificate => [runtimeCertificationKey(certificate), certificate]));
  const known = new Map(manifest.capabilities.runtimes.map(descriptor => [runtimeDescriptorIdentity(descriptor), descriptor]));
  const canonical = (input: unknown): RuntimeDescriptor => {
    const descriptor = runtimeDescriptorSchema.parse(input);
    const registered = known.get(runtimeDescriptorIdentity(descriptor));
    if (!registered) throw new Error("Unknown frozen runtime descriptor");
    return registered;
  };
  return Object.freeze({
    manifest,
    selectRuntime: (context: RuntimeSelectionContext) => selectValidatedRuntime(enabled, manifest, runtimeSelectionContextSchema.parse(context), certifications),
    resolveHistoricalRuntime(work: HistoricalRuntimeWork): HistoricalRuntimeResolution {
      if (work.executionRuntimeSnapshot != null) {
        const descriptor = canonical(work.executionRuntimeSnapshot);
        if (work.engineVersion !== executionEngineVersion(descriptor)) throw new Error("Frozen runtime and engine version disagree");
        return Object.freeze({ provenance: "recorded", descriptor });
      }
      const mapping = manifest.historical.find(entry => entry.engineVersion === work.engineVersion);
      if (!mapping) throw new Error(`Unknown historical runtime ${work.engineVersion}`);
      if (executionEngineVersion(mapping.adapter) !== work.engineVersion)
        throw new Error("Historical adapter and recorded engine version disagree");
      return Object.freeze({ provenance: "unrecorded", engineVersion: work.engineVersion, adapter: mapping.adapter });
    },
    bindEngine(input: RuntimeDescriptor): DescriptorBoundClient<T> {
      const descriptor = canonical(input);
      const client = clientFactory(descriptor);
      const version = executionEngineVersion(descriptor);
      if (client.version !== version || runtimeDescriptorIdentity(runtimeDescriptorSchema.parse(client.descriptor)) !== runtimeDescriptorIdentity(descriptor))
        throw new Error("Client factory returned a mismatched runtime identity");
      // Preserve prototype methods/private state while exposing fixed identity. The
      // factory owns lifecycle; another binding never mutates this client.
      return new Proxy(Object.freeze({ descriptor, version }), {
        get(_target, property) {
          if (property === "descriptor") return descriptor;
          if (property === "version") return version;
          const value: unknown = Reflect.get(client, property, client);
          return typeof value === "function" ? value.bind(client) : value;
        },
        set() { throw new Error("Descriptor-bound client is immutable"); },
        defineProperty() { throw new Error("Descriptor-bound client is immutable"); },
        deleteProperty() { throw new Error("Descriptor-bound client is immutable"); },
      }) as DescriptorBoundClient<T>;
    },
  });
}
