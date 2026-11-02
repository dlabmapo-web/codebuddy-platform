import { z } from "zod";

export const nativeDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
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
    comparator: z
      .object({
        engine: z.literal("pyodide"),
        version: z.string().min(1).max(128),
        packageDigest: nativeDigestSchema,
        semanticsVersion: z.string().min(1).max(128),
      })
      .strict(),
  })
  .strict();
export type NativeRuntimeDescriptor = z.infer<
  typeof nativeRuntimeDescriptorSchema
>;
/** Schema parse fixes property order and rejects unknown fields before comparison. */
export function nativeRuntimeIdentity(
  descriptor: NativeRuntimeDescriptor,
): string {
  return JSON.stringify(nativeRuntimeDescriptorSchema.parse(descriptor));
}
export function sameNativeRuntime(
  a: NativeRuntimeDescriptor,
  b: NativeRuntimeDescriptor,
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
export const nativeReleaseManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    descriptor: nativeRuntimeDescriptorSchema,
    resources: nativeNodeResourcesSchema,
    /** Explicit scope only. Empty means no admission, useful for qualification. */
    eligibility: z
      .array(
        z
          .object({
            organizationId: z.string().uuid(),
            academyId: z.string().uuid(),
            materialId: z.string().uuid(),
            gradingRevision: z.number().int().nonnegative(),
            context: z.enum(["live", "preview"]),
            kinds: z
              .array(
                z.enum(["official", "staff-practice", "sample", "regrade"]),
              )
              .min(1)
              .max(4),
            memoryLimitMb: z.number().int().min(16).max(4096),
            timeLimitMs: z.number().int().min(1).max(120_000),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type NativeReleaseManifest = z.infer<typeof nativeReleaseManifestSchema>;
