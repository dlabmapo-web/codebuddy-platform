import { describe, expect, it } from "vitest";

import { monitoringLimits } from "./monitoring.js";
import {
  codePointByteLength,
  terminalAppendMessageSchema,
  terminalByteLength,
  terminalClearMessageSchema,
  terminalFinishMessageSchema,
  terminalLineSchema,
  terminalMirrorEventSchema,
  terminalMirrorMessageSchema,
  terminalSnapshotMessageSchema,
  terminalStartMessageSchema,
  terminalStateMessageSchema,
  terminalTruncationText,
} from "./terminal.js";

/**
 * What the mirror protocol accepts, and — more importantly — what it refuses.
 *
 * Every rejection here is a way a modified client could otherwise corrupt a
 * teacher's transcript or spend a room's bandwidth: an unnumbered run, a
 * sequence that walks backwards, an empty delta that costs a message to say
 * nothing, or a single line larger than the whole batch budget.
 */

const draftId = "44444444-4444-4444-8444-444444444444";
const clientRunId = "55555555-5555-4555-8555-555555555555";
const at = "2026-08-06T10:00:00.000Z";

const start = {
  kind: "start" as const,
  draftId,
  clientRunId,
  at,
  sequence: 0 as const,
  lifecycle: "STARTED" as const,
  lines: [{ kind: "meta" as const, text: "$ python solution.py\n" }],
  sampleCount: 0,
  awaitingInput: false,
};

const append = {
  kind: "append" as const,
  draftId,
  clientRunId,
  at,
  sequence: 1,
  lines: [{ kind: "out" as const, text: "3\n" }],
};

describe("terminal message schemas", () => {
  it("accepts every message the student publisher produces", () => {
    expect(terminalStartMessageSchema.safeParse(start).success).toBe(true);
    expect(terminalAppendMessageSchema.safeParse(append).success).toBe(true);
    expect(
      terminalStateMessageSchema.safeParse({
        kind: "state",
        draftId,
        clientRunId,
        at,
        sequence: 2,
        awaitingInput: true,
      }).success,
    ).toBe(true);
    expect(
      terminalFinishMessageSchema.safeParse({
        kind: "finish",
        draftId,
        clientRunId,
        at,
        sequence: 3,
        lifecycle: "COMPLETED",
        passedCount: 1,
        sampleCount: 1,
        awaitingInput: false,
      }).success,
    ).toBe(true);
    expect(
      terminalSnapshotMessageSchema.safeParse({
        kind: "snapshot",
        draftId,
        clientRunId,
        at,
        sequence: 3,
        lifecycle: "COMPLETED",
        lines: [{ kind: "out", text: "3\n" }],
        passedCount: 1,
        sampleCount: 1,
        awaitingInput: false,
        truncated: false,
      }).success,
    ).toBe(true);
    expect(
      terminalClearMessageSchema.safeParse({ kind: "clear", draftId, at })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(
      terminalMirrorMessageSchema.safeParse({ ...append, kind: "keystroke" })
        .success,
    ).toBe(false);
  });

  it("refuses a run that does not open at zero", () => {
    expect(terminalStartMessageSchema.safeParse({ ...start, sequence: 1 }).success)
      .toBe(false);
    // And a delta may not claim the opening number, which would let a stale
    // event masquerade as the start of the run.
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, sequence: 0 }).success,
    ).toBe(false);
  });

  it("refuses negative, fractional, and unbounded sequences", () => {
    for (const sequence of [
      -1,
      1.5,
      monitoringLimits.terminalMaxSequence + 1,
      Number.NaN,
    ]) {
      expect(
        terminalAppendMessageSchema.safeParse({ ...append, sequence }).success,
      ).toBe(false);
    }
  });

  it("refuses an empty delta", () => {
    // A message that appends nothing is a message that costs a round trip to
    // say nothing at all.
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, lines: [] }).success,
    ).toBe(false);
  });

  it("refuses an empty line, which has no representation on screen", () => {
    expect(terminalLineSchema.safeParse({ kind: "out", text: "" }).success).toBe(
      false,
    );
  });

  it("refuses a kind the terminal cannot colour", () => {
    expect(
      terminalLineSchema.safeParse({ kind: "stdin", text: "3\n" }).success,
    ).toBe(false);
  });

  it("refuses an invalid draft or run identity", () => {
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, draftId: "draft-1" })
        .success,
    ).toBe(false);
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, clientRunId: "run" })
        .success,
    ).toBe(false);
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, at: "yesterday" })
        .success,
    ).toBe(false);
  });

  it("refuses a line larger than the line budget", () => {
    const oversized = "x".repeat(monitoringLimits.terminalLineMaxBytes + 1);
    expect(
      terminalAppendMessageSchema.safeParse({
        ...append,
        lines: [{ kind: "out", text: oversized }],
      }).success,
    ).toBe(false);
  });

  it("refuses a delta larger than the delta budget", () => {
    // Each line is legal on its own; together they are not. Summing rather
    // than trusting the per-line check is what bounds a batch of maximal lines.
    const line = { kind: "out" as const, text: "y".repeat(4_000) };
    const lines = Array.from({ length: 8 }, () => line);
    expect(terminalLinesTotal(lines)).toBeGreaterThan(
      monitoringLimits.terminalDeltaMaxBytes,
    );
    expect(
      terminalAppendMessageSchema.safeParse({ ...append, lines }).success,
    ).toBe(false);
  });

  it("refuses a snapshot larger than the transcript budget", () => {
    const line = { kind: "out" as const, text: "z".repeat(8_000) };
    const lines = Array.from({ length: 80 }, () => line);
    expect(
      terminalSnapshotMessageSchema.safeParse({
        kind: "snapshot",
        draftId,
        clientRunId,
        at,
        sequence: 4,
        lifecycle: "COMPLETED",
        lines,
        passedCount: 0,
        sampleCount: 0,
        awaitingInput: false,
        truncated: true,
      }).success,
    ).toBe(false);
  });

  it("accepts only the exact truncation marker beyond the content budget", () => {
    const content = "z".repeat(monitoringLimits.terminalTranscriptMaxBytes);
    const truncated = {
      kind: "snapshot" as const,
      draftId,
      clientRunId,
      at,
      sequence: 4,
      lifecycle: "CANCELLED" as const,
      lines: [
        { kind: "out" as const, text: content },
        { kind: "info" as const, text: terminalTruncationText },
      ],
      passedCount: 0,
      sampleCount: 0,
      awaitingInput: false,
      truncated: true,
    };

    // The content line itself must still obey the 8 KiB line limit.
    truncated.lines = [
      ...Array.from(
        {
          length:
            monitoringLimits.terminalTranscriptMaxBytes /
            monitoringLimits.terminalLineMaxBytes,
        },
        () => ({
          kind: "out" as const,
          text: "z".repeat(monitoringLimits.terminalLineMaxBytes),
        }),
      ),
      { kind: "info" as const, text: terminalTruncationText },
    ];
    expect(terminalSnapshotMessageSchema.safeParse(truncated).success).toBe(true);
    expect(
      terminalSnapshotMessageSchema.safeParse({
        ...truncated,
        lines: [
          ...truncated.lines.slice(0, -1),
          { kind: "info", text: "\n[not the shared marker]\n" },
        ],
      }).success,
    ).toBe(false);
    expect(
      terminalSnapshotMessageSchema.safeParse({
        ...truncated,
        truncated: false,
      }).success,
    ).toBe(false);
  });

  it("refuses a finished run that is still reported as started", () => {
    expect(
      terminalFinishMessageSchema.safeParse({
        kind: "finish",
        draftId,
        clientRunId,
        at,
        sequence: 3,
        lifecycle: "STARTED",
        passedCount: 0,
        sampleCount: 0,
        awaitingInput: false,
      }).success,
    ).toBe(false);
  });

  it("has no field for hidden grading data or an actor identity", () => {
    const parsed = terminalStartMessageSchema.parse({
      ...start,
      // Everything a modified client might try to smuggle alongside a run.
      studentMembershipId: draftId,
      academyId: draftId,
      room: `academy:${draftId}:draft:${draftId}`,
      expectedOutput: "42\n",
      hiddenInput: "42\n",
      accessToken: "ey.jwt",
    });
    expect(Object.keys(parsed).sort()).toEqual([
      "at",
      "awaitingInput",
      "clientRunId",
      "draftId",
      "kind",
      "lifecycle",
      "lines",
      "sampleCount",
      "sequence",
    ]);
  });
});

describe("terminalMirrorEventSchema", () => {
  it("carries the origin the gateway stamped, and only that origin", () => {
    expect(
      terminalMirrorEventSchema.safeParse({ ...append, origin: "STUDENT" })
        .success,
    ).toBe(true);
    // A teacher's terminal is theirs alone; there is no such mirror event.
    expect(
      terminalMirrorEventSchema.safeParse({ ...append, origin: "TEACHER" })
        .success,
    ).toBe(false);
    expect(terminalMirrorEventSchema.safeParse(append).success).toBe(false);
  });
});

describe("byte accounting", () => {
  it("counts UTF-8 bytes rather than code units", () => {
    expect(terminalByteLength("abc")).toBe(3);
    expect(terminalByteLength("안녕")).toBe(6);
    expect(terminalByteLength("🙂")).toBe(4);
  });

  it("prices one code point exactly as encoding it would", () => {
    for (const char of ["a", "é", "안", "🙂"]) {
      expect(codePointByteLength(char.codePointAt(0)!)).toBe(
        terminalByteLength(char),
      );
    }
  });
});

function terminalLinesTotal(lines: { text: string }[]): number {
  return lines.reduce((total, line) => total + terminalByteLength(line.text), 0);
}
