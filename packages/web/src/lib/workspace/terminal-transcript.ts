import {
  codePointByteLength,
  monitoringLimits,
  terminalByteLength,
  terminalTruncationText,
  type TerminalKind,
  type TerminalLifecycle,
  type TerminalLine,
  type TerminalMirrorEvent,
} from '@cove/shared';

/**
 * One terminal transcript, and the only rules that may change it.
 *
 * The student's runner and the teacher's mirror both fold their lines through
 * this module, which is what makes the two screens the same screen: the same
 * coalescing, the same 8 KiB split, the same 512 KiB ceiling, and therefore the
 * same truncation line in the same place. Reconstructing a transcript from
 * `stdout` on the far side — what the previous monitoring pane did — could not
 * have that property, because banners, submitted input, tracebacks and sample
 * verdicts never travelled through `stdout` at all.
 *
 * Pure by construction: no React, no socket, no clock. Everything here is a
 * value in and a value out, so both sides can be tested without a browser.
 */

export type { TerminalKind, TerminalLine, TerminalLifecycle };

/**
 * The boundary marker, in both terminals.
 *
 * Deliberately one shared constant rather than a translated string: it is the
 * point at which two transcripts stop being comparable, and a locale must not
 * be able to move it.
 */
export const truncationLine: TerminalLine = {
  kind: 'info',
  text: terminalTruncationText,
};

export type TerminalTranscript = {
  /** Null before any run has been seen. */
  clientRunId: string | null;
  /** The highest applied sequence for `clientRunId`. */
  sequence: number;
  lifecycle: TerminalLifecycle | null;
  lines: TerminalLine[];
  /** UTF-8 bytes of `lines`, carried so appending stays O(delta). */
  bytes: number;
  /** True once the budget was reached and the boundary line was written. */
  truncated: boolean;
  awaitingInput: boolean;
  sampleCount: number;
  passedCount: number;
  /**
   * True between detecting a gap and repairing it from a snapshot. The mirror
   * keeps showing the last state it is sure of while this is set.
   */
  synchronizing: boolean;
  /**
   * The runs already replaced. Bounded, and only ever used to recognise a
   * straggler from a finished run so it cannot overwrite the current one.
   */
  retiredRunIds: string[];
};

export const emptyTranscript: TerminalTranscript = {
  clientRunId: null,
  sequence: -1,
  lifecycle: null,
  lines: [],
  bytes: 0,
  truncated: false,
  awaitingInput: false,
  sampleCount: 0,
  passedCount: 0,
  synchronizing: false,
  retiredRunIds: [],
};

/** How many finished runs are remembered as retired. */
const retainedRunIds = 4;

/* --------------------------------------------------------------- shaping */

/**
 * Merges adjacent lines of the same kind.
 *
 * Pyodide writes `print("hello")` as several `stdout` chunks, and the terminal
 * renders consecutive spans of one kind as continuous text — so merging them
 * changes the number of lines and nothing a reader can see. It also keeps the
 * transcript's line count bounded by how often output actually *changes*
 * category rather than by how often the worker flushed.
 */
export function coalesceLines(
  lines: readonly TerminalLine[],
): TerminalLine[] {
  const merged: TerminalLine[] = [];
  for (const line of lines) {
    if (line.text === '') continue;
    const last = merged[merged.length - 1];
    if (last && last.kind === line.kind) {
      merged[merged.length - 1] = { kind: last.kind, text: last.text + line.text };
      continue;
    }
    merged.push({ kind: line.kind, text: line.text });
  }
  return merged;
}

/**
 * Splits one line at the last code-point boundary within the line budget.
 *
 * Splitting by byte index would cut a Korean character or an emoji in half and
 * put a replacement character on both screens, so the walk is by code point and
 * the cost of each is arithmetic rather than an encode.
 */
export function splitLine(
  line: TerminalLine,
  limit: number = monitoringLimits.terminalLineMaxBytes,
): TerminalLine[] {
  if (terminalByteLength(line.text) <= limit) return [line];

  const parts: TerminalLine[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line.text) {
    const size = codePointByteLength(char.codePointAt(0)!);
    if (bytes + size > limit) {
      parts.push({ kind: line.kind, text: current });
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current !== '') parts.push({ kind: line.kind, text: current });
  return parts;
}

/** Coalesce, then split: the wire shape both sides agree on. */
export function normalizeLines(
  lines: readonly TerminalLine[],
): TerminalLine[] {
  return coalesceLines(lines).flatMap((line) => splitLine(line));
}

/* -------------------------------------------------------------- reduction */

/**
 * Appends output, and stops at the budget rather than at the tab's memory.
 *
 * A runaway `while True: print(x)` is a normal student mistake. The transcript
 * takes what fits, writes the boundary line once, and refuses everything after
 * it — identically on both screens, because both call this with the same lines
 * in the same order.
 */
export function appendToTranscript(
  transcript: TerminalTranscript,
  incoming: readonly TerminalLine[],
): TerminalTranscript {
  if (transcript.truncated) return transcript;

  const lines = [...transcript.lines];
  let bytes = transcript.bytes;
  let truncated = false;

  const budget = monitoringLimits.terminalTranscriptMaxBytes;
  const maxLines = monitoringLimits.terminalTranscriptMaxLines;

  const push = (line: TerminalLine) => {
    const last = lines[lines.length - 1];
    // Coalescing against the tail is what makes a chunked stream and a batched
    // one produce byte-identical transcripts.
    if (
      last &&
      last.kind === line.kind &&
      terminalByteLength(last.text) + terminalByteLength(line.text) <=
        monitoringLimits.terminalLineMaxBytes
    ) {
      lines[lines.length - 1] = { kind: last.kind, text: last.text + line.text };
      return;
    }
    lines.push(line);
  };

  for (const line of normalizeLines(incoming)) {
    const size = terminalByteLength(line.text);
    if (bytes + size > budget) {
      const room = budget - bytes;
      const kept = room > 0 ? clipToBytes(line.text, room) : '';
      if (kept !== '') {
        push({ kind: line.kind, text: kept });
        bytes += terminalByteLength(kept);
      }
      truncated = true;
      break;
    }
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    push(line);
    bytes += size;
  }

  if (truncated) {
    lines.push(truncationLine);
    bytes += terminalByteLength(truncationLine.text);
  }

  return { ...transcript, lines, bytes, truncated };
}

/** A new run replaces the previous transcript, banner included. */
export function startTranscript(
  transcript: TerminalTranscript,
  input: {
    clientRunId: string;
    lines: readonly TerminalLine[];
    sampleCount: number;
    awaitingInput: boolean;
  },
): TerminalTranscript {
  const retired = transcript.clientRunId
    ? [transcript.clientRunId, ...transcript.retiredRunIds].slice(
        0,
        retainedRunIds,
      )
    : transcript.retiredRunIds;

  return appendToTranscript(
    {
      ...emptyTranscript,
      clientRunId: input.clientRunId,
      sequence: 0,
      lifecycle: 'STARTED',
      sampleCount: input.sampleCount,
      awaitingInput: input.awaitingInput,
      retiredRunIds: retired,
    },
    input.lines,
  );
}

/** Commits the public verdict metadata used by finish events and snapshots. */
export function settleTranscript(
  transcript: TerminalTranscript,
  settlement: {
    lifecycle: Exclude<TerminalLifecycle, 'STARTED'>;
    passedCount: number;
    sampleCount: number;
  },
): TerminalTranscript {
  return {
    ...transcript,
    lifecycle: settlement.lifecycle,
    passedCount: settlement.passedCount,
    sampleCount: settlement.sampleCount,
    awaitingInput: false,
  };
}

export type TerminalApplyOutcome =
  /** Folded in; `transcript` is the new state. */
  | 'applied'
  /** A duplicate, a replay, or a straggler from a replaced run. */
  | 'stale'
  /** Something was missed; the mirror is marked synchronizing. */
  | 'gap';

/**
 * The teacher's side of ordering and idempotency.
 *
 * The three answers are the whole contract: apply the next sequence, ignore
 * anything at or behind the current one, and never guess across a hole. A gap
 * leaves the last certain state on screen and asks for a snapshot, because a
 * transcript with a silent hole in it is worse than one that admits it is
 * catching up.
 */
export function applyTerminalEvent(
  transcript: TerminalTranscript,
  event: TerminalMirrorEvent,
): { outcome: TerminalApplyOutcome; transcript: TerminalTranscript } {
  if (event.kind === 'clear') {
    return { outcome: 'applied', transcript: emptyTranscript };
  }

  if (event.kind === 'snapshot') {
    // Authoritative by construction: it is the student's own current state, so
    // it replaces whatever the mirror believed and closes any gap.
    return {
      outcome: 'applied',
      transcript: fromSnapshot(transcript, event),
    };
  }

  if (event.kind === 'start') {
    if (event.clientRunId === transcript.clientRunId) {
      return { outcome: 'stale', transcript };
    }
    if (transcript.retiredRunIds.includes(event.clientRunId)) {
      return { outcome: 'stale', transcript };
    }
    return {
      outcome: 'applied',
      transcript: startTranscript(transcript, {
        clientRunId: event.clientRunId,
        lines: event.lines,
        sampleCount: event.sampleCount,
        awaitingInput: event.awaitingInput,
      }),
    };
  }

  // A run whose start was never seen cannot be extended: the banner and every
  // line before this one are missing, so this is a gap and not a beginning.
  if (event.clientRunId !== transcript.clientRunId) {
    if (transcript.retiredRunIds.includes(event.clientRunId)) {
      return { outcome: 'stale', transcript };
    }
    return {
      outcome: 'gap',
      transcript: { ...transcript, synchronizing: true },
    };
  }

  if (event.sequence <= transcript.sequence) {
    return { outcome: 'stale', transcript };
  }
  if (event.sequence > transcript.sequence + 1) {
    return {
      outcome: 'gap',
      transcript: { ...transcript, synchronizing: true },
    };
  }

  const next: TerminalTranscript = { ...transcript, sequence: event.sequence };
  switch (event.kind) {
    case 'append':
      return { outcome: 'applied', transcript: appendToTranscript(next, event.lines) };
    case 'state':
      return {
        outcome: 'applied',
        transcript: { ...next, awaitingInput: event.awaitingInput },
      };
    case 'finish':
      return {
        outcome: 'applied',
        transcript: {
          ...next,
          lifecycle: event.lifecycle,
          awaitingInput: event.awaitingInput,
          passedCount: event.passedCount,
          sampleCount: event.sampleCount,
        },
      };
  }
}

/** Replaces the mirror with the student's own current transcript. */
export function fromSnapshot(
  transcript: TerminalTranscript,
  snapshot: {
    clientRunId: string;
    sequence: number;
    lifecycle: TerminalLifecycle;
    lines: readonly TerminalLine[];
    awaitingInput: boolean;
    passedCount: number;
    sampleCount: number;
    truncated: boolean;
  },
): TerminalTranscript {
  const retired =
    transcript.clientRunId && transcript.clientRunId !== snapshot.clientRunId
      ? [transcript.clientRunId, ...transcript.retiredRunIds].slice(
          0,
          retainedRunIds,
        )
      : transcript.retiredRunIds;
  const lines = normalizeLines(snapshot.lines);
  return {
    clientRunId: snapshot.clientRunId,
    sequence: snapshot.sequence,
    lifecycle: snapshot.lifecycle,
    lines,
    bytes: lines.reduce((total, line) => total + terminalByteLength(line.text), 0),
    truncated: snapshot.truncated,
    awaitingInput: snapshot.awaitingInput,
    sampleCount: snapshot.sampleCount,
    passedCount: snapshot.passedCount,
    synchronizing: false,
    retiredRunIds: retired,
  };
}

/** The transcript as a snapshot message body, minus the wire envelope. */
export function snapshotBody(transcript: TerminalTranscript): {
  sequence: number;
  lifecycle: TerminalLifecycle;
  lines: TerminalLine[];
  awaitingInput: boolean;
  passedCount: number;
  sampleCount: number;
  truncated: boolean;
} {
  return {
    sequence: Math.max(0, transcript.sequence),
    lifecycle: transcript.lifecycle ?? 'STARTED',
    lines: transcript.lines,
    awaitingInput: transcript.awaitingInput,
    passedCount: transcript.passedCount,
    sampleCount: transcript.sampleCount,
    truncated: transcript.truncated,
  };
}

/** Keeps the leading whole code points that fit in `limit` bytes. */
function clipToBytes(text: string, limit: number): string {
  let kept = '';
  let bytes = 0;
  for (const char of text) {
    const size = codePointByteLength(char.codePointAt(0)!);
    if (bytes + size > limit) break;
    kept += char;
    bytes += size;
  }
  return kept;
}
