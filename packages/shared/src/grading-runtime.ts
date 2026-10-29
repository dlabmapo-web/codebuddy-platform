import { z } from "zod";
import { gradingDataLimits } from "./grading-limits.js";
import { inputPromptPolicySchema } from "./content/course.js";

const boundedIdentity = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/);
export const immutableDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const runtimeDescriptorSchema = z.strictObject({
  version: z.literal(1), engine: z.enum(["pyodide", "cpython"]),
  /** Raw package/interpreter version. ExecutionEngine.version uses a family prefix. */
  engineVersion: z.string().max(128).regex(/^\d+\.\d+\.\d+(?:[.+-][A-Za-z0-9.-]+)?$/), pythonVersion: z.string().regex(/^3\.\d+\.\d+$/).max(32),
  platform: z.literal("linux"), architecture: z.enum(["amd64", "arm64"]),
  imageDigest: immutableDigestSchema, packageManifestHash: immutableDigestSchema,
  shimVersion: boundedIdentity,
  memoryPolicy: z.enum(["pyodide-charged-growth-v1", "native-cgroup-growth-v1"]),
  executionPolicy: z.literal("wall-v1"),
}).superRefine((runtime, ctx) => {
  if ((runtime.engine === "cpython") !== (runtime.memoryPolicy === "native-cgroup-growth-v1"))
    ctx.addIssue({ code: "custom", message: "Engine and memory policy disagree" });
  if (runtime.engine === "cpython" && (!runtime.pythonVersion.startsWith("3.12.") || runtime.engineVersion !== runtime.pythonVersion))
    ctx.addIssue({ code: "custom", message: "Native pilot requires matching CPython 3.12 patch versions" });
}).readonly();
export type RuntimeDescriptor = Readonly<z.infer<typeof runtimeDescriptorSchema>>;
/** Stable complete identity, independent of JSON property ordering. */
export function runtimeDescriptorIdentity(descriptor: RuntimeDescriptor): string {
  return JSON.stringify([descriptor.version, descriptor.engine, descriptor.engineVersion, descriptor.pythonVersion,
    descriptor.platform, descriptor.architecture, descriptor.imageDigest, descriptor.packageManifestHash,
    descriptor.shimVersion, descriptor.memoryPolicy, descriptor.executionPolicy]);
}
export function executionEngineVersion(descriptor: RuntimeDescriptor): string {
  return `${descriptor.engine}-${descriptor.engineVersion}`;
}
const certificationKeyFields = {
  organizationId: z.uuid(), academyId: z.uuid(), materialId: z.uuid(),
  gradingRevision: z.number().int().nonnegative().max(2147483647), context: z.enum(["live", "preview"]),
};
export const runtimeSelectionContextSchema = z.strictObject({ ...certificationKeyFields,
  memoryLimitMb: z.number().int().positive().max(2147483647), timeLimitMs: z.number().int().positive().max(2147483647),
});
export type RuntimeSelectionContext = Readonly<z.infer<typeof runtimeSelectionContextSchema>>;
export const runtimeCertificationSchema = z.strictObject({ ...certificationKeyFields,
  memoryLimitMb: z.number().int().min(32).max(256), timeLimitMs: z.number().int().min(100).max(60000),
  packageProfile: z.literal("standard-library"), runtime: runtimeDescriptorSchema,
});
export type RuntimeCertification = Readonly<z.infer<typeof runtimeCertificationSchema>>;
export function runtimeCertificationKey(context: Pick<RuntimeSelectionContext, keyof typeof certificationKeyFields>): string {
  return JSON.stringify([context.organizationId, context.academyId, context.materialId, context.gradingRevision, context.context]);
}
export const GRADING_BROKER_PROTOCOL_VERSION = 1 as const;
export const brokerCapabilityManifestSchema = z.strictObject({
  version: z.literal(1), protocol: z.literal(GRADING_BROKER_PROTOCOL_VERSION),
  runtimes: z.array(runtimeDescriptorSchema).min(1).max(64),
  nativeMemoryPolicy: z.literal("native-cgroup-growth-v1"),
  maxActive: z.literal(2), maxBackground: z.literal(1), maxSpare: z.union([z.literal(0), z.literal(1)]),
  nativeProfile: z.strictObject({
    packageProfile: z.literal("standard-library"), pythonFamily: z.literal("3.12"),
    memoryLimitMb: z.strictObject({ min: z.literal(32), max: z.literal(256) }),
    timeLimitMs: z.strictObject({ min: z.literal(100), max: z.literal(60000) }),
  }),
  compatibilityProfile: z.strictObject({
    memoryLimitMb: z.strictObject({ min: z.literal(16), max: z.literal(4096) }),
    timeLimitMs: z.strictObject({ min: z.literal(1), max: z.literal(60000) }),
  }),
  codeChars: z.literal(gradingDataLimits.codeChars), stdinChars: z.literal(gradingDataLimits.testTextChars),
  stdoutBytes: z.literal(gradingDataLimits.stdoutBytes), stderrBytes: z.literal(gradingDataLimits.stderrBytes),
});
export type BrokerCapabilityManifest = Readonly<z.infer<typeof brokerCapabilityManifestSchema>>;
export const runtimeManifestSchema = z.strictObject({
  version: z.literal(1), compatibility: runtimeDescriptorSchema, native: runtimeDescriptorSchema.nullable(),
  academyAllowances: z.array(z.strictObject({ organizationId: z.uuid(), academyId: z.uuid() })).max(10000),
  certifications: z.array(runtimeCertificationSchema).max(100000),
  historical: z.array(z.strictObject({ engineVersion: boundedIdentity, adapter: runtimeDescriptorSchema })).max(128),
  capabilities: brokerCapabilityManifestSchema,
}).superRefine((manifest, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (manifest.compatibility.engine !== "pyodide") fail("Compatibility runtime must be Pyodide");
  if (manifest.native && manifest.native.engine !== "cpython") fail("Native runtime must be CPython");
  const identities = manifest.capabilities.runtimes.map(runtimeDescriptorIdentity);
  if (new Set(identities).size !== identities.length) fail("Duplicate capability runtime");
  for (const runtime of [manifest.compatibility, ...(manifest.native ? [manifest.native] : []), ...manifest.historical.map(entry => entry.adapter)])
    if (!identities.includes(runtimeDescriptorIdentity(runtime))) fail("Runtime missing broker capability");
  if (new Set(manifest.historical.map(entry => entry.engineVersion)).size !== manifest.historical.length) fail("Duplicate historical identity");
  for (const entry of manifest.historical)
    if (entry.engineVersion !== executionEngineVersion(entry.adapter)) fail("Historical adapter and recorded engine version disagree");
  const allowances = manifest.academyAllowances.map(entry => JSON.stringify([entry.organizationId, entry.academyId]));
  if (new Set(allowances).size !== allowances.length) fail("Duplicate academy allowance");
  const keys = manifest.certifications.map(runtimeCertificationKey);
  if (new Set(keys).size !== keys.length) fail("Duplicate certification");
  for (const certificate of manifest.certifications) {
    if (!manifest.native || runtimeDescriptorIdentity(certificate.runtime) !== runtimeDescriptorIdentity(manifest.native)) fail("Certificate runtime differs from native identity");
    if (!allowances.includes(JSON.stringify([certificate.organizationId, certificate.academyId]))) fail("Certificate outside academy allowance");
  }
});
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type RuntimeManifest = DeepReadonly<z.infer<typeof runtimeManifestSchema>>;
export type HistoricalRuntimeResolution =
  | { readonly provenance: "recorded"; readonly descriptor: RuntimeDescriptor }
  | { readonly provenance: "unrecorded"; readonly engineVersion: string; readonly adapter: RuntimeDescriptor };

export const executionAttemptContextSchema = z.strictObject({
  attemptId: z.uuid(), kind: z.enum(["submission", "practice", "sample", "maintenance"]),
  caseId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  generation: z.number().int().positive().max(2147483647), leaseToken: z.uuid(), workerGeneration: z.uuid(),
});
export type ExecutionAttemptContext = Readonly<z.infer<typeof executionAttemptContextSchema>>;
export const brokerExecutionInputSchema = z.strictObject({
  code: z.string().max(gradingDataLimits.codeChars), stdin: z.string().max(gradingDataLimits.testTextChars),
  inputPromptPolicy: inputPromptPolicySchema,
  timeLimitMs: z.number().int().min(1).max(60000), memoryLimitMb: z.number().int().min(16).max(4096),
  outputLimitBytes: z.number().int().positive().max(gradingDataLimits.stdoutBytes),
});
export type BrokerExecutionInput = z.infer<typeof brokerExecutionInputSchema>;
const byteString = (max: number) => z.string().max(max).refine(value => new TextEncoder().encode(value).byteLength <= max, "UTF-8 capture exceeds byte limit");
export const brokerExecutionResultSchema = z.strictObject({
  stdout: byteString(gradingDataLimits.stdoutBytes), stderr: byteString(gradingDataLimits.stderrBytes),
  outcome: z.enum(["PASSED", "RUNTIME_ERROR", "TIME_LIMIT", "MEMORY_LIMIT"]), runtimeMs: z.number().finite().nonnegative().max(86400000), outputTruncated: z.boolean(),
});
export type BrokerExecutionResult = z.infer<typeof brokerExecutionResultSchema>;
export const executionReceiptSchema = z.strictObject({
  version: z.literal(1), brokerGeneration: z.uuid(), receiptId: z.uuid(), reservationId: z.uuid(), context: executionAttemptContextSchema,
  runtime: runtimeDescriptorSchema, result: brokerExecutionResultSchema, cleanup: z.literal("removed"),
});
export type ExecutionReceipt = Readonly<z.infer<typeof executionReceiptSchema>>;
const envelope = { protocol: z.literal(GRADING_BROKER_PROTOCOL_VERSION), requestId: z.uuid() };
const admissionEpochSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const bound = { brokerGeneration: z.uuid(), context: executionAttemptContextSchema, runtime: runtimeDescriptorSchema };
const reserved = { ...bound, reservationId: z.uuid() };
export const brokerRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("health") }),
  z.strictObject({ ...envelope, ...bound, type: z.literal("reserve"), admissionEpoch: admissionEpochSchema, memoryLimitMb: z.number().int().min(16).max(4096) }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("run"), input: brokerExecutionInputSchema }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("receipt") }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("ack"), receiptId: z.uuid(), checkpointId: z.uuid() }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("release") }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("retire"), terminalCommitId: z.uuid() }),
  z.strictObject({ ...envelope, type: z.literal("seal"), brokerGeneration: z.uuid(), workerGeneration: z.uuid(), admissionEpoch: admissionEpochSchema, reconciliationId: z.uuid() }),
  z.strictObject({ ...envelope, ...bound, reservationId: z.uuid().optional(), type: z.literal("cancel") }),
]);
export type BrokerRequest = z.infer<typeof brokerRequestSchema>;
export const brokerResponseSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...envelope, type: z.literal("health"), brokerGeneration: z.uuid(), workerGeneration: z.uuid().nullable(), admissionEpoch: admissionEpochSchema, capabilities: brokerCapabilityManifestSchema }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("reserved"), admissionEpoch: admissionEpochSchema }),
  z.strictObject({ ...envelope, type: z.literal("receipt"), receipt: executionReceiptSchema }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("pending"), state: z.enum(["reserved", "running", "uncertain", "acknowledged"]) }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("acknowledged"), receiptId: z.uuid() }),
  z.strictObject({ ...envelope, ...bound, reservationId: z.uuid().nullable(), type: z.literal("released"), cleanup: z.literal("removed") }),
  z.strictObject({ ...envelope, ...reserved, type: z.literal("retired"), terminalCommitId: z.uuid() }),
  z.strictObject({ ...envelope, type: z.literal("sealed"), brokerGeneration: z.uuid(), workerGeneration: z.uuid(), admissionEpoch: admissionEpochSchema, nextAdmissionEpoch: admissionEpochSchema, reconciliationId: z.uuid() }),
  z.strictObject({ ...envelope, type: z.literal("error"), code: z.enum(["BUSY", "UNSUPPORTED", "IDENTITY_MISMATCH", "STALE_GENERATION", "UNCERTAIN", "NOT_FOUND", "INFRASTRUCTURE"]), message: z.string().max(512) }),
]);
export type BrokerResponse = z.infer<typeof brokerResponseSchema>;
/** Reject oversized frames before JSON parsing. Transport must cap buffers to this too. */
export const GRADING_BROKER_MAX_FRAME_BYTES = gradingDataLimits.sandboxFrameBytes;
export function decodeBrokerRequest(frame: string): BrokerRequest {
  if (new TextEncoder().encode(frame).byteLength > GRADING_BROKER_MAX_FRAME_BYTES) throw new Error("Broker frame exceeds limit");
  return brokerRequestSchema.parse(JSON.parse(frame));
}
export function decodeBrokerResponse(frame: string): BrokerResponse {
  if (new TextEncoder().encode(frame).byteLength > GRADING_BROKER_MAX_FRAME_BYTES) throw new Error("Broker frame exceeds limit");
  return brokerResponseSchema.parse(JSON.parse(frame));
}
