import { z } from "zod";

export const nativeDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const nativeComparatorSchema = z
  .object({
    engine: z.literal("pyodide"),
    version: z.string().min(1).max(128),
    packageDigest: nativeDigestSchema,
    semanticsVersion: z.string().min(1).max(128),
  })
  .strict();
/** Every semantic/build input participates in equality, never just Python's version. */
export const nativeRuntimeDescriptorSchema = z
  .object({
    schemaVersion: z.literal(1),
    engine: z.literal("native-cpython"),
    pythonVersion: z.string().regex(/^3\.12\.\d+$/),
    architecture: z.enum(["amd64", "arm64"]),
    rootfsDigest: nativeDigestSchema,
    packageManifestDigest: nativeDigestSchema,
    nsjailRevision: revision,
    nsjailBinaryDigest: nativeDigestSchema,
    sandboxPolicyVersion: z.literal("nsjail-cpython-v1"),
    sandboxPolicyDigest: nativeDigestSchema,
    guestBootstrapDigest: nativeDigestSchema,
    comparator: nativeComparatorSchema,
  })
  .strict();
export type NativeRuntimeDescriptor = z.infer<
  typeof nativeRuntimeDescriptorSchema
>;
/** The compiled languages and the argv each is compiled with. */
export const nativeCompiledLanguages = ["C", "CPP"] as const;
export type NativeCompiledLanguage = (typeof nativeCompiledLanguages)[number];
const compilerArgvSchema = z.array(z.string().min(1).max(256)).min(1).max(32);
/**
 * GCC for C and C++. Its own family beside CPython, so a toolchain change never
 * changes Python's identity or queues. Every field participates in identity,
 * including each language's exact compiler argv and the precompiled header.
 */
export const nativeGccDescriptorSchema = z
  .object({
    schemaVersion: z.literal(1),
    engine: z.literal("native-gcc"),
    gccVersion: z.string().regex(/^12\.\d+\.\d+$/),
    architecture: z.enum(["amd64", "arm64"]),
    toolchainRootfsDigest: nativeDigestSchema,
    runRootfsDigest: nativeDigestSchema,
    packageManifestDigest: nativeDigestSchema,
    compile: z
      .object({
        C: z.object({ argv: compilerArgvSchema }).strict(),
        CPP: z.object({ argv: compilerArgvSchema, pchDigest: nativeDigestSchema }).strict(),
      })
      .strict(),
    nsjailRevision: revision,
    nsjailBinaryDigest: nativeDigestSchema,
    sandboxPolicyVersion: z.literal("nsjail-gcc-v1"),
    compilePolicyDigest: nativeDigestSchema,
    runPolicyDigest: nativeDigestSchema,
    execGateDigest: nativeDigestSchema,
    comparator: nativeComparatorSchema,
  })
  .strict();
export type NativeGccDescriptor = z.infer<typeof nativeGccDescriptorSchema>;
export const nativeAnyRuntimeDescriptorSchema = z.discriminatedUnion("engine", [
  nativeRuntimeDescriptorSchema,
  nativeGccDescriptorSchema,
]);
export type NativeAnyRuntimeDescriptor = NativeRuntimeDescriptor | NativeGccDescriptor;
/** Schema parse fixes property order and rejects unknown fields before comparison. */
export function nativeRuntimeIdentity(
  descriptor: NativeAnyRuntimeDescriptor,
): string {
  return JSON.stringify(
    descriptor.engine === "native-gcc"
      ? nativeGccDescriptorSchema.parse(descriptor)
      : nativeRuntimeDescriptorSchema.parse(descriptor),
  );
}
export function sameNativeRuntime(
  a: NativeAnyRuntimeDescriptor,
  b: NativeAnyRuntimeDescriptor,
): boolean {
  return nativeRuntimeIdentity(a) === nativeRuntimeIdentity(b);
}
export const nativeNodeResourcesSchema = z
  .object({
    physicalMemoryMb: z.number().int().min(2048),
    envelopeMemoryMb: z.number().int().positive(),
    serviceOverheadMb: z.number().int().positive(),
    caseOverheadMb: z.number().int().positive(),
    cpuSlots: z.number().int().min(1).max(1024),
    officialReservedSlots: z.number().int().min(1),
    officialReservedMemoryMb: z.number().int().positive(),
    maxCaseMemoryMb: z.number().int().min(16).max(4096),
    maxCasePids: z.number().int().min(1).max(128),
    scratchMb: z.number().int().min(1).max(128),
    /** Process limit of one native-gcc compile (driver, compiler, assembler, linker). */
    maxCompilePids: z.number().int().min(4).max(64).default(16),
    /**
     * The native-gcc artifact store's tmpfs. Its pages are charged to the
     * service, outside every case reservation, so the service overhead must
     * hold all of it (checked with a GCC runtime in the manifest below).
     */
    artifactStoreMb: z.number().int().min(64).max(4096).default(256),
  })
  .strict()
  .superRefine((r, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      r.envelopeMemoryMb >
      r.physicalMemoryMb - Math.max(1024, Math.ceil(r.physicalMemoryMb * 0.2))
    )
      fail("OS headroom must be at least 20% and 1 GiB");
    if (r.officialReservedSlots > r.cpuSlots)
      fail("Official slot reserve exceeds capacity");
    const available = r.envelopeMemoryMb - r.serviceOverheadMb;
    if (
      r.officialReservedMemoryMb <
      r.officialReservedSlots *
        (r.maxCaseMemoryMb + r.caseOverheadMb + r.scratchMb)
    )
      fail(
        "Official memory reserve must cover every reserved maximum-size case",
      );
    if (r.officialReservedMemoryMb > available)
      fail("Official memory reserve exceeds capacity");
    if (r.maxCaseMemoryMb + r.caseOverheadMb + r.scratchMb > available)
      fail("Certified case cannot fit in envelope");
  });
export type NativeNodeResources = z.infer<typeof nativeNodeResourcesSchema>;
const nativeAdmissionKindSchema = z.enum(["official", "staff-practice", "sample", "regrade", "run"]);
/** Absent means Python only, so an entry written before C/C++ admits what it did. */
const nativeLanguagesSchema = z.array(z.enum(["PYTHON", "C", "CPP"])).min(1).max(3).optional();
/** One certified exercise revision, exactly as authored when it was qualified. */
export const nativeMaterialEligibilitySchema = z
  .object({
    organizationId: z.string().uuid(),
    academyId: z.string().uuid(),
    materialId: z.string().uuid(),
    gradingRevision: z.number().int().nonnegative(),
    context: z.enum(["live", "preview"]),
    kinds: z.array(nativeAdmissionKindSchema).min(1).max(5),
    languages: nativeLanguagesSchema,
    memoryLimitMb: z.number().int().min(16).max(4096),
    timeLimitMs: z.number().int().min(1).max(120_000),
    /** Absent retains the original default-only certification. */
    maxCaseTimeLimitMs: z.number().int().min(1).max(120_000).optional(),
  })
  .strict()
  .refine(
    entry => (entry.maxCaseTimeLimitMs ?? entry.timeLimitMs) >= entry.timeLimitMs,
    { message: "Certified case timeout cannot be lower than the exercise default" },
  );
/**
 * Every exercise of an academy, of a whole organization when `academyId` is
 * absent, or of the whole platform when both are absent, whose authored limits
 * fit the node: memory within its certified class and no case longer than
 * `maxCaseTimeLimitMs`. Edits keep their admission, and exercises outside
 * these limits stay on compatibility grading.
 */
export const nativeScopeEligibilitySchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    academyId: z.string().uuid().optional(),
    contexts: z.array(z.enum(["live", "preview"])).min(1).max(2),
    kinds: z.array(nativeAdmissionKindSchema).min(1).max(5),
    languages: nativeLanguagesSchema,
    maxCaseTimeLimitMs: z.number().int().min(1).max(120_000),
  })
  .strict()
  .refine((entry) => entry.academyId === undefined || entry.organizationId !== undefined, {
    message: "An academy scope names its organization",
  });
export const nativeEligibilitySchema = z.union([
  nativeMaterialEligibilitySchema,
  nativeScopeEligibilitySchema,
]);
export type NativeEligibility = z.infer<typeof nativeEligibilitySchema>;
/** One artifact's largest binary plus its diagnostics, rounded up. */
export const NATIVE_ARTIFACT_RESERVATION_MB = 65;
export const nativeReleaseManifestSchema = z
  .object({
    /** 2 may carry a GCC runtime; 1 is a CPython-only node. */
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    descriptor: nativeRuntimeDescriptorSchema,
    gcc: nativeGccDescriptorSchema.optional(),
    resources: nativeNodeResourcesSchema,
    /** Explicit scope only. Empty means no admission, useful for qualification. */
    eligibility: z.array(nativeEligibilitySchema).max(10000),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (!m.gcc) return;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (m.schemaVersion !== 2) fail("A GCC runtime needs manifest version 2");
    if (m.gcc.architecture !== m.descriptor.architecture ||
        m.gcc.nsjailRevision !== m.descriptor.nsjailRevision ||
        m.gcc.nsjailBinaryDigest !== m.descriptor.nsjailBinaryDigest ||
        JSON.stringify(m.gcc.comparator) !== JSON.stringify(m.descriptor.comparator))
      fail("Both runtimes of one node share its architecture, NsJail and comparator");
    // Every admitted attempt may lease its largest artifact at once.
    if (m.resources.artifactStoreMb < m.resources.cpuSlots * NATIVE_ARTIFACT_RESERVATION_MB)
      fail("Artifact store cannot hold every slot's largest artifact");
    if (m.resources.artifactStoreMb >= m.resources.serviceOverheadMb)
      fail("Service overhead must hold the whole artifact store");
  });
export type NativeReleaseManifest = z.infer<typeof nativeReleaseManifestSchema>;
