import { z } from "zod";

import { monitoringLimits } from "./monitoring.js";

/**
 * The mirrored student terminal, as it crosses the wire.
 *
 * A teacher watching a student reads the terminal the student is looking at:
 * the same banner, the same input lines, the same traceback, in the same order
 * and the same colours. That is only reliable if both sides speak one
 * vocabulary, so the line kinds, the lifecycle, the limits, and the ordering
 * rules are stated here once and imported by the student's publisher, the
 * gateway's validation, and the teacher's reducer alike.
 *
 * What is *absent* is as deliberate as what is present. There is no field for a
 * hidden test input, a hidden expected output, a worker diagnostic, a token, a
 * membership, a room, or a target teacher — so none of them can travel through
 * a mirror by accident or by a modified client's choice.
 */

/* ------------------------------------------------------------------ lines */

/**
 * The five categories the terminal already renders. `in` is input the student
 * has *submitted*: a draft still being typed has no representation here, which
 * is what keeps an unfinished keystroke off the teacher's screen.
 */
export const terminalKinds = ["out", "err", "in", "meta", "info"] as const;
export const terminalKindSchema = z.enum(terminalKinds);
export type TerminalKind = z.infer<typeof terminalKindSchema>;

/** The only bytes a truncated snapshot may carry beyond its content budget. */
export const terminalTruncationText = "\n[output truncated]\n";

const encoder = new TextEncoder();

/** UTF-8 bytes, which is what every budget in this protocol is counted in. */
export function terminalByteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

/**
 * The byte cost of one code point, without allocating.
 *
 * Splitting a long line has to land on a character boundary, and encoding the
 * whole string once per candidate boundary would make a megabyte of output
 * quadratic. The four UTF-8 ranges are fixed, so the cost is arithmetic.
 */
export function codePointByteLength(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

export const terminalLineSchema = z.object({
  kind: terminalKindSchema,
  text: z
    .string()
    .min(1)
    .refine(
      (text) => terminalByteLength(text) <= monitoringLimits.terminalLineMaxBytes,
      { message: "terminal line exceeds the maximum size" },
    ),
});
export type TerminalLine = z.infer<typeof terminalLineSchema>;

export function terminalLinesByteLength(
  lines: readonly TerminalLine[],
): number {
  return lines.reduce((total, line) => total + terminalByteLength(line.text), 0);
}

const deltaLinesSchema = z
  .array(terminalLineSchema)
  .min(1)
  .max(monitoringLimits.terminalLinesPerDelta)
  .refine(
    (lines) =>
      terminalLinesByteLength(lines) <= monitoringLimits.terminalDeltaMaxBytes,
    { message: "terminal delta exceeds the maximum size" },
  );

const bannerLinesSchema = z
  .array(terminalLineSchema)
  .max(monitoringLimits.terminalLinesPerDelta)
  .refine(
    (lines) =>
      terminalLinesByteLength(lines) <= monitoringLimits.terminalDeltaMaxBytes,
    { message: "terminal delta exceeds the maximum size" },
  );

const transcriptLinesSchema = z
  .array(terminalLineSchema)
  .max(monitoringLimits.terminalTranscriptMaxLines + 1);

/* -------------------------------------------------------------- lifecycle */

export const terminalLifecycles = [
  "STARTED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export const terminalLifecycleSchema = z.enum(terminalLifecycles);
export type TerminalLifecycle = z.infer<typeof terminalLifecycleSchema>;

/* --------------------------------------------------------------- messages */

const sequenceSchema = z
  .number()
  .int()
  .min(0)
  .max(monitoringLimits.terminalMaxSequence);

const countSchema = z.number().int().nonnegative().max(10_000);

/**
 * What every message about one execution carries.
 *
 * `clientRunId` names the execution and `sequence` orders it. Neither says who
 * is running: the gateway stamps the authenticated student itself, so a payload
 * has nothing to be believed about.
 */
const terminalRunBase = z.object({
  draftId: z.uuid(),
  clientRunId: z.uuid(),
  at: z.iso.datetime(),
});

export const terminalStartMessageSchema = terminalRunBase.extend({
  kind: z.literal("start"),
  /** A run opens at zero; anything else is not the beginning of one. */
  sequence: z.literal(0),
  lifecycle: z.literal("STARTED"),
  /** The `$ python solution.py` banner, and for a sample its test number. */
  lines: bannerLinesSchema,
  sampleCount: countSchema,
  awaitingInput: z.boolean(),
});

export const terminalAppendMessageSchema = terminalRunBase.extend({
  kind: z.literal("append"),
  sequence: sequenceSchema.min(1),
  lines: deltaLinesSchema,
});

export const terminalStateMessageSchema = terminalRunBase.extend({
  kind: z.literal("state"),
  sequence: sequenceSchema.min(1),
  awaitingInput: z.boolean(),
});

export const terminalFinishMessageSchema = terminalRunBase.extend({
  kind: z.literal("finish"),
  sequence: sequenceSchema.min(1),
  /** A finished run is no longer `STARTED`, whatever else it became. */
  lifecycle: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
  passedCount: countSchema,
  sampleCount: countSchema,
  awaitingInput: z.boolean(),
});

/**
 * The whole current transcript, for a late join or a repaired gap.
 *
 * Sent in answer to a server request, never on the hot path: a delta stream
 * that had to carry the full transcript would be the slowest way to say the
 * least.
 */
export const terminalSnapshotMessageSchema = terminalRunBase
  .extend({
    kind: z.literal("snapshot"),
    sequence: sequenceSchema,
    lifecycle: terminalLifecycleSchema,
    lines: transcriptLinesSchema,
    passedCount: countSchema,
    sampleCount: countSchema,
    awaitingInput: z.boolean(),
    truncated: z.boolean(),
  })
  .superRefine((snapshot, context) => {
    const bytes = terminalLinesByteLength(snapshot.lines);
    const regularLimit = monitoringLimits.terminalTranscriptMaxBytes;
    const regularLineLimit = monitoringLimits.terminalTranscriptMaxLines;
    if (!snapshot.truncated) {
      if (bytes > regularLimit || snapshot.lines.length > regularLineLimit) {
        context.addIssue({
          code: "custom",
          path: ["lines"],
          message: "terminal transcript exceeds the maximum size",
        });
      }
      return;
    }

    const marker = snapshot.lines.at(-1);
    if (marker?.kind !== "info" || marker.text !== terminalTruncationText) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "truncated terminal transcript must end with its marker",
      });
      return;
    }
    if (
      bytes > regularLimit + terminalByteLength(terminalTruncationText) ||
      snapshot.lines.length > regularLineLimit + 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "truncated terminal transcript exceeds the maximum size",
      });
    }
  });

/** The draft this mirror belonged to is no longer the one on screen. */
export const terminalClearMessageSchema = z.object({
  kind: z.literal("clear"),
  draftId: z.uuid(),
  at: z.iso.datetime(),
});

export const terminalMirrorMessageSchema = z.discriminatedUnion("kind", [
  terminalStartMessageSchema,
  terminalAppendMessageSchema,
  terminalStateMessageSchema,
  terminalFinishMessageSchema,
  terminalSnapshotMessageSchema,
  terminalClearMessageSchema,
]);
export type TerminalMirrorMessage = z.infer<typeof terminalMirrorMessageSchema>;
export type TerminalStartMessage = z.infer<typeof terminalStartMessageSchema>;
export type TerminalAppendMessage = z.infer<typeof terminalAppendMessageSchema>;
export type TerminalStateMessage = z.infer<typeof terminalStateMessageSchema>;
export type TerminalFinishMessage = z.infer<typeof terminalFinishMessageSchema>;
export type TerminalSnapshotMessage = z.infer<
  typeof terminalSnapshotMessageSchema
>;

/* ------------------------------------------------------ server to client */

/**
 * The same message, with the one field a client may not write.
 *
 * `origin` is the gateway's own statement about which side of the room the
 * message came from. A teacher-authored mirror message never reaches here at
 * all — it is dropped — so the literal is the only value this can hold.
 */
const studentOrigin = { origin: z.literal("STUDENT") };

export const terminalMirrorEventSchema = z.discriminatedUnion("kind", [
  terminalStartMessageSchema.extend(studentOrigin),
  terminalAppendMessageSchema.extend(studentOrigin),
  terminalStateMessageSchema.extend(studentOrigin),
  terminalFinishMessageSchema.extend(studentOrigin),
  terminalSnapshotMessageSchema.extend(studentOrigin),
  terminalClearMessageSchema.extend(studentOrigin),
]);
export type TerminalMirrorEvent = z.infer<typeof terminalMirrorEventSchema>;

/**
 * The server asking one student for their current transcript.
 *
 * A draft id and nothing else. The student is never told that a *particular*
 * teacher asked, or that a teacher asked at all rather than the server
 * repairing itself — which is the same discipline the monitoring indicator
 * follows.
 */
export const terminalSnapshotRequestSchema = z.object({ draftId: z.uuid() });
export type TerminalSnapshotRequest = z.infer<
  typeof terminalSnapshotRequestSchema
>;

/** A teacher asking the server to have the snapshot re-sent. */
export const terminalResyncPayloadSchema = z.object({ draftId: z.uuid() });
export type TerminalResyncPayload = z.infer<typeof terminalResyncPayloadSchema>;
