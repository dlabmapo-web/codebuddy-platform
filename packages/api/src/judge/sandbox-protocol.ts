import type { Socket } from "node:net";

import { z } from "zod";

/**
 * The one conversation between the judge and the student-code sandbox.
 *
 * One request and one response per connection, each a single line of JSON.
 * Both directions are validated and size-capped: the judge does not trust the
 * sandbox's answer any more than the sandbox trusts the code it runs, so a
 * reply of the wrong shape, for the wrong request, or too large to be honest
 * is refused as an infrastructure fault — never read as a verdict.
 *
 * Deliberately free of project imports, so the sandbox side needs nothing but
 * this file, the engine and Pyodide.
 */

export const SANDBOX_PROTOCOL_VERSION = 1;

/**
 * Code and stdin are each at most 100 000 characters, and JSON escapes a
 * control character as six bytes; program output is capped at 256 KiB per
 * stream. Four MiB bounds either frame with room to spare.
 */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024;

const idSchema = z.string().uuid();

export const sandboxRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run"),
    id: idSchema,
    request: z.object({
      code: z.string().max(100_000),
      stdin: z.string().max(100_000),
      timeLimitMs: z.number().int().min(1).max(300_000),
      memoryLimitMb: z.number().int().min(1).max(4_096),
    }),
  }),
  z.object({ type: z.literal("health"), id: idSchema }),
]);
export type SandboxRequest = z.infer<typeof sandboxRequestSchema>;

/** What an engine can conclude about one execution. Nothing else is a verdict. */
export const sandboxOutcomes = [
  "PASSED",
  "RUNTIME_ERROR",
  "TIME_LIMIT",
  "MEMORY_LIMIT",
] as const;

export const sandboxResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("result"),
    id: idSchema,
    result: z.object({
      stdout: z.string(),
      stderr: z.string(),
      outcome: z.enum(sandboxOutcomes),
      runtimeMs: z.number().int().nonnegative(),
    }),
  }),
  /** The sandbox could not execute the case: an infrastructure fault. */
  z.object({ type: z.literal("error"), id: idSchema, message: z.string().max(500) }),
  z.object({
    type: z.literal("health"),
    id: idSchema,
    protocol: z.literal(SANDBOX_PROTOCOL_VERSION),
    engineVersion: z.string(),
    /** Whether the sandbox verified its own isolation at boot. */
    isolated: z.boolean(),
  }),
]);
export type SandboxResponse = z.infer<typeof sandboxResponseSchema>;

/**
 * Reads exactly one newline-terminated frame from `socket`.
 *
 * Rejects on an oversized frame, a closed or errored connection, or invalid
 * JSON. The caller owns the timeout and the socket's lifetime.
 */
export function readFrame(socket: Socket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = (): void => {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("close", onEnd);
      socket.off("error", onError);
    };
    const onData = (chunk: Buffer): void => {
      const newline = chunk.indexOf(0x0a);
      const kept = newline === -1 ? chunk : chunk.subarray(0, newline);
      size += kept.byteLength;
      if (size > MAX_FRAME_BYTES) {
        cleanup();
        reject(new Error("sandbox frame too large"));
        return;
      }
      chunks.push(kept);
      if (newline === -1) return;
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("sandbox frame is not JSON"));
      }
    };
    const onEnd = (): void => {
      cleanup();
      reject(new Error("sandbox connection closed before a frame arrived"));
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.on("data", onData);
    socket.on("end", onEnd);
    socket.on("close", onEnd);
    socket.on("error", onError);
  });
}

export function writeFrame(socket: Socket, frame: unknown): void {
  socket.write(`${JSON.stringify(frame)}\n`);
}
