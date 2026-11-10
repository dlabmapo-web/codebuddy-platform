import { createHash } from "node:crypto";
import { z } from "zod";
import {
  nativeAnyRuntimeDescriptorSchema,
  nativeDigestSchema,
  nativeRuntimeIdentity,
  type NativeAnyRuntimeDescriptor,
  type NativeGccDescriptor,
  type NativeRuntimeDescriptor,
  type InputPromptPolicy,
} from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";
export const FRAME_LIMIT = gradingDataLimits.sandboxFrameBytes;
export const STDERR_LIMIT = gradingDataLimits.stderrBytes;
/** GCC's messages kept for one compile: enough for the first errors. */
export const COMPILE_DIAGNOSTICS_LIMIT = 16 * 1024;
/** One attempt's lease on its compiled program: at most a whole job's budget. */
export const MAX_LEASE_MS = 30 * 60_000;
export const requestSchema = z
  .object({
    code: z.string().max(gradingDataLimits.codeChars),
    stdin: z.string().max(gradingDataLimits.testTextChars),
    inputPromptPolicy: z.enum(["INCLUDE", "IGNORE"]).optional(),
    timeLimitMs: z.number().int().min(1).max(120_000),
    memoryLimitMb: z.number().int().min(16).max(4096),
    outputLimitBytes: z
      .number()
      .int()
      .min(1)
      .max(gradingDataLimits.stdoutBytes)
      .optional(),
  })
  .strict();
export type NativeExecutionRequest = z.infer<typeof requestSchema> & {
  signal?: AbortSignal;
};
/** A compiled program's case: the artifact a compile leased, never source. */
export const binaryRequestSchema = z
  .object({
    artifact: nativeDigestSchema,
    lease: z.string().uuid(),
    stdin: z.string().max(gradingDataLimits.testTextChars),
    timeLimitMs: z.number().int().min(1).max(120_000),
    memoryLimitMb: z.number().int().min(16).max(4096),
    outputLimitBytes: z
      .number()
      .int()
      .min(1)
      .max(gradingDataLimits.stdoutBytes)
      .optional(),
  })
  .strict();
export type NativeBinaryRequest = z.infer<typeof binaryRequestSchema> & {
  signal?: AbortSignal;
};
export const compileRequestSchema = z
  .object({
    language: z.enum(["C", "CPP"]),
    code: z.string().min(1).max(gradingDataLimits.codeChars),
    leaseMs: z.number().int().min(1000).max(MAX_LEASE_MS),
  })
  .strict();
export type NativeCompileRequest = z.infer<typeof compileRequestSchema> & {
  signal?: AbortSignal;
};
export const releaseRequestSchema = z
  .object({ lease: z.string().uuid() })
  .strict();
export const nativeTimingsSchema = z
  .object({
    startupMs: z.number().finite().nonnegative(),
    executionMs: z.number().finite().nonnegative(),
    cleanupMs: z.number().finite().nonnegative(),
    acquisitionMs: z.number().finite().nonnegative().optional(),
    /** The case claimed a jail started and verified before its request arrived. */
    prewarmed: z.boolean().optional(),
  })
  .strict();
export type NativeTimings = z.infer<typeof nativeTimingsSchema>;
/** Signals a compiled program's ending is reported with; anything else is OTHER. */
export const terminationSignals = [
  "SIGSEGV",
  "SIGFPE",
  "SIGABRT",
  "SIGSYS",
  "SIGBUS",
  "SIGILL",
  "SIGKILL",
  "OTHER",
] as const;
/**
 * How a compiled program ended, from its exec gate's status record. Absent
 * when the host decided the outcome (time, memory, cancellation).
 */
export const terminationSchema = z.union([
  z.object({ exit: z.number().int().min(0).max(255) }).strict(),
  z.object({ signal: z.enum(terminationSignals) }).strict(),
]);
export type NativeTermination = z.infer<typeof terminationSchema>;
export type NativeExecutionResult = {
  stdout: string;
  stderr: string;
  outcome: "PASSED" | "RUNTIME_ERROR" | "TIME_LIMIT" | "MEMORY_LIMIT";
  runtimeMs: number;
  outputTruncated?: boolean;
  termination?: NativeTermination;
  timings?: NativeTimings;
};
export const resultSchema = z
  .object({
    stdout: z
      .string()
      .max(gradingDataLimits.stdoutBytes)
      .refine(
        (value) => Buffer.byteLength(value) <= gradingDataLimits.stdoutBytes,
        "stdout exceeds UTF-8 byte limit",
      ),
    stderr: z
      .string()
      .max(STDERR_LIMIT)
      .refine(
        (value) => Buffer.byteLength(value) <= STDERR_LIMIT,
        "stderr exceeds UTF-8 byte limit",
      ),
    outcome: z.enum(["PASSED", "RUNTIME_ERROR", "TIME_LIMIT", "MEMORY_LIMIT"]),
    runtimeMs: z.number().finite().nonnegative(),
    outputTruncated: z.boolean().optional(),
    termination: terminationSchema.optional(),
    timings: nativeTimingsSchema.optional(),
  })
  .strict();
const diagnosticsSchema = z
  .string()
  .refine(
    (value) => Buffer.byteLength(value) <= COMPILE_DIAGNOSTICS_LIMIT,
    "diagnostics exceed their byte limit",
  );
export const compileResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("COMPILED"),
      artifact: nativeDigestSchema,
      lease: z.string().uuid(),
      /** Warnings, if any. */
      diagnostics: diagnosticsSchema,
      compileMs: z.number().finite().nonnegative(),
      cached: z.boolean(),
    })
    .strict(),
  z
    .object({
      status: z.literal("COMPILE_ERROR"),
      /** LIMITS only from the host's own cgroup and timer evidence. */
      reason: z.enum(["ERRORS", "LIMITS"]),
      diagnostics: diagnosticsSchema,
      compileMs: z.number().finite().nonnegative(),
      cached: z.boolean(),
    })
    .strict(),
]);
export type NativeCompileResult = z.infer<typeof compileResultSchema>;
export const healthSchema = z
  .object({
    ready: z.boolean(),
    generation: z.string().uuid(),
    descriptor: nativeAnyRuntimeDescriptorSchema,
    active: z.number().int().nonnegative(),
    draining: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
  })
  .strict();
export type NativeHealth = z.infer<typeof healthSchema>;
/**
 * One request per connection. A body matches its operation and runtime: CPython
 * runs source (`request`); GCC compiles (`compile`), runs a leased artifact
 * (`binary`) and releases the lease (`release`).
 */
export const wireRequestSchema = z
  .object({
    protocol: z.literal(2),
    id: z.string().uuid(),
    descriptor: nativeAnyRuntimeDescriptorSchema,
    operation: z.enum(["run", "health", "compile", "release"]),
    lane: z.enum(["official", "background"]),
    request: requestSchema.optional(),
    binary: binaryRequestSchema.optional(),
    compile: compileRequestSchema.optional(),
    release: releaseRequestSchema.optional(),
  })
  .strict()
  .refine((x) => {
    const bodies = [x.request, x.binary, x.compile, x.release].filter(
      (body) => body !== undefined,
    ).length;
    const gcc = x.descriptor.engine === "native-gcc";
    switch (x.operation) {
      case "health":
        return bodies === 0;
      case "run":
        return bodies === 1 && (gcc ? Boolean(x.binary) : Boolean(x.request));
      case "compile":
        return bodies === 1 && gcc && Boolean(x.compile);
      case "release":
        return bodies === 1 && gcc && Boolean(x.release);
    }
  }, "Request body must match its operation and runtime");
export const wireResponseSchema = z
  .object({
    protocol: z.literal(2),
    id: z.string().uuid(),
    descriptor: nativeAnyRuntimeDescriptorSchema,
    generation: z.string().uuid(),
    result: resultSchema.optional(),
    health: healthSchema.optional(),
    compiled: compileResultSchema.optional(),
    released: z.literal(true).optional(),
    error: z
      .enum(["UNAVAILABLE", "INVALID_REQUEST", "INFRASTRUCTURE", "CANCELLED"])
      .optional(),
  })
  .strict()
  .refine(
    (x) =>
      [x.result, x.health, x.compiled, x.released, x.error].filter(
        (x) => x !== undefined,
      ).length === 1,
    "Exactly one response body",
  );
export type WireRequest = z.infer<typeof wireRequestSchema>;
export type WireResponse = z.infer<typeof wireResponseSchema>;
export class NativeInfrastructureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NativeInfrastructureError";
  }
}
/** `native-cpython-…` or `native-gcc-…`, then the identity's full SHA-256. */
export function nativeRuntimeVersion(
  descriptor: NativeAnyRuntimeDescriptor,
): string {
  return `${descriptor.engine}-${createHash("sha256").update(nativeRuntimeIdentity(descriptor)).digest("hex")}`;
}
export type {
  NativeAnyRuntimeDescriptor,
  NativeGccDescriptor,
  NativeRuntimeDescriptor,
  InputPromptPolicy,
};
