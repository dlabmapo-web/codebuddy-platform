import { createHash } from "node:crypto";
import { z } from "zod";
import {
  nativeRuntimeDescriptorSchema,
  nativeRuntimeIdentity,
  type NativeRuntimeDescriptor,
  type InputPromptPolicy,
} from "@cove/shared";
import { gradingDataLimits } from "@cove/shared/grading-limits";
export const FRAME_LIMIT = gradingDataLimits.sandboxFrameBytes;
export const STDERR_LIMIT = gradingDataLimits.stderrBytes;
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
export type NativeExecutionResult = {
  stdout: string;
  stderr: string;
  outcome: "PASSED" | "RUNTIME_ERROR" | "TIME_LIMIT" | "MEMORY_LIMIT";
  runtimeMs: number;
  outputTruncated?: boolean;
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
    timings: nativeTimingsSchema.optional(),
  })
  .strict();
export const healthSchema = z
  .object({
    ready: z.boolean(),
    generation: z.string().uuid(),
    descriptor: nativeRuntimeDescriptorSchema,
    active: z.number().int().nonnegative(),
    draining: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
  })
  .strict();
export type NativeHealth = z.infer<typeof healthSchema>;
export const wireRequestSchema = z
  .object({
    protocol: z.literal(1),
    id: z.string().uuid(),
    descriptor: nativeRuntimeDescriptorSchema,
    operation: z.enum(["run", "health"]),
    lane: z.enum(["official", "background"]),
    request: requestSchema.optional(),
  })
  .strict()
  .refine(
    (x) => (x.operation === "run") === Boolean(x.request),
    "Request required only for run",
  );
export const wireResponseSchema = z
  .object({
    protocol: z.literal(1),
    id: z.string().uuid(),
    descriptor: nativeRuntimeDescriptorSchema,
    generation: z.string().uuid(),
    result: resultSchema.optional(),
    health: healthSchema.optional(),
    error: z
      .enum(["UNAVAILABLE", "INVALID_REQUEST", "INFRASTRUCTURE", "CANCELLED"])
      .optional(),
  })
  .strict()
  .refine(
    (x) =>
      [x.result, x.health, x.error].filter((x) => x !== undefined).length === 1,
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
export function nativeRuntimeVersion(
  descriptor: NativeRuntimeDescriptor,
): string {
  return `native-cpython-${createHash("sha256").update(nativeRuntimeIdentity(descriptor)).digest("hex")}`;
}
export type { NativeRuntimeDescriptor, InputPromptPolicy };
