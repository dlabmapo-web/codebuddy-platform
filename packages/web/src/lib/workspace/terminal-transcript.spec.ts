import {
  monitoringLimits,
  terminalByteLength,
  terminalSnapshotMessageSchema,
  type TerminalLine,
  type TerminalMirrorEvent,
} from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  appendToTranscript,
  applyTerminalEvent,
  coalesceLines,
  emptyTranscript,
  normalizeLines,
  snapshotBody,
  splitLine,
  settleTranscript,
  startTranscript,
  truncationLine,
  type TerminalTranscript,
} from './terminal-transcript';

/**
 * The rules that keep two terminals identical.
 *
 * These are the properties the mirror rests on: order and kind survive
 * unchanged, coalescing is invisible, both sides truncate at the same byte, and
 * no duplicate, replay, hole, or straggler from a replaced run can move the
 * transcript somewhere the student never was.
 */

const draftId = '44444444-4444-4444-8444-444444444444';
const runA = '55555555-5555-4555-8555-555555555555';
const runB = '66666666-6666-4666-8666-666666666666';
const at = '2026-08-06T10:00:00.000Z';

const rendered = (transcript: TerminalTranscript) =>
  transcript.lines.map((line) => line.text).join('');

function started(clientRunId = runA): TerminalTranscript {
  return startTranscript(emptyTranscript, {
    clientRunId,
    lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
    sampleCount: 0,
    awaitingInput: false,
  });
}

const append = (
  sequence: number,
  lines: TerminalLine[],
  clientRunId = runA,
): TerminalMirrorEvent => ({
  kind: 'append',
  origin: 'STUDENT',
  draftId,
  clientRunId,
  at,
  sequence,
  lines,
});

describe('coalesceLines', () => {
  it('merges adjacent chunks of one kind without changing the text', () => {
    const merged = coalesceLines([
      { kind: 'out', text: 'Hel' },
      { kind: 'out', text: 'lo, ' },
      { kind: 'out', text: 'world\n' },
      { kind: 'err', text: 'Traceback\n' },
      { kind: 'out', text: 'after\n' },
    ]);

    expect(merged).toEqual([
      { kind: 'out', text: 'Hello, world\n' },
      { kind: 'err', text: 'Traceback\n' },
      { kind: 'out', text: 'after\n' },
    ]);
  });

  it('never merges across kinds, because the colour is the meaning', () => {
    const merged = coalesceLines([
      { kind: 'in', text: '3\n' },
      { kind: 'out', text: '3\n' },
    ]);
    expect(merged.map((line) => line.kind)).toEqual(['in', 'out']);
  });

  it('drops empty chunks, which have nothing to render', () => {
    expect(coalesceLines([{ kind: 'out', text: '' }])).toEqual([]);
  });
});

describe('splitLine', () => {
  it('splits at the line budget', () => {
    const parts = splitLine({
      kind: 'out',
      text: 'x'.repeat(monitoringLimits.terminalLineMaxBytes * 2 + 5),
    });
    expect(parts).toHaveLength(3);
    expect(parts.map((part) => part.text).join('')).toHaveLength(
      monitoringLimits.terminalLineMaxBytes * 2 + 5,
    );
    expect(new Set(parts.map((part) => part.kind))).toEqual(new Set(['out']));
  });

  it('never cuts a character in half', () => {
    // Three-byte characters against a limit that is not a multiple of three:
    // a byte-index split would produce replacement characters on both screens.
    const parts = splitLine({ kind: 'out', text: '안'.repeat(4) }, 8);
    expect(parts.map((part) => part.text)).toEqual(['안안', '안안']);
  });
});

describe('appendToTranscript', () => {
  it('preserves exact order and kind', () => {
    const transcript = appendToTranscript(started(), [
      { kind: 'in', text: '2\n' },
      { kind: 'out', text: '4\n' },
      { kind: 'err', text: 'ZeroDivisionError\n' },
      { kind: 'info', text: 'Expected output:\n' },
    ]);

    expect(transcript.lines.map((line) => line.kind)).toEqual([
      'meta',
      'in',
      'out',
      'err',
      'info',
    ]);
    expect(rendered(transcript)).toBe(
      '$ python solution.py\n2\n4\nZeroDivisionError\nExpected output:\n',
    );
  });

  it('reaches the same text and byte count whether chunked or batched', () => {
    const chunks = [
      { kind: 'out' as const, text: 'Hel' },
      { kind: 'out' as const, text: 'lo, ' },
      { kind: 'out' as const, text: 'world\n' },
    ];
    // The student appends as the worker writes; the mirror receives one batch.
    const streamed = chunks.reduce(
      (transcript, chunk) => appendToTranscript(transcript, [chunk]),
      started(),
    );
    const batched = appendToTranscript(started(), chunks);

    expect(rendered(streamed)).toBe(rendered(batched));
    expect(streamed.bytes).toBe(batched.bytes);
  });

  it('stops at the transcript budget and says so once', () => {
    const line = { kind: 'out' as const, text: 'y'.repeat(4_000) };
    let transcript = started();
    for (let index = 0; index < 200; index += 1) {
      transcript = appendToTranscript(transcript, [line]);
    }

    expect(transcript.truncated).toBe(true);
    expect(transcript.lines[transcript.lines.length - 1]).toEqual(truncationLine);
    // Filled to the budget exactly, then the boundary line and nothing else.
    expect(transcript.bytes).toBe(
      monitoringLimits.terminalTranscriptMaxBytes +
        terminalByteLength(truncationLine.text),
    );
    // One boundary line, not one per refused write.
    expect(
      transcript.lines.filter((entry) => entry.text === truncationLine.text),
    ).toHaveLength(1);
    const snapshot = terminalSnapshotMessageSchema.safeParse({
      kind: 'snapshot',
      draftId,
      clientRunId: runA,
      at,
      ...snapshotBody(transcript),
    });
    expect(snapshot.success).toBe(true);
  });

  it('truncates at the same byte for a chunked and a batched writer', () => {
    const total = monitoringLimits.terminalTranscriptMaxBytes + 5_000;
    const batched = appendToTranscript(started(), [
      { kind: 'out', text: 'z'.repeat(total) },
    ]);
    let streamed = started();
    for (let written = 0; written < total; written += 997) {
      streamed = appendToTranscript(streamed, [
        { kind: 'out', text: 'z'.repeat(Math.min(997, total - written)) },
      ]);
    }

    expect(streamed.truncated).toBe(true);
    expect(batched.truncated).toBe(true);
    expect(rendered(streamed)).toBe(rendered(batched));
  });

  it('refuses everything after the boundary', () => {
    const truncated: TerminalTranscript = { ...started(), truncated: true };
    expect(appendToTranscript(truncated, [{ kind: 'out', text: 'more\n' }])).toBe(
      truncated,
    );
  });
});

describe('applyTerminalEvent', () => {
  it('applies the next sequence', () => {
    const result = applyTerminalEvent(
      started(),
      append(1, [{ kind: 'out', text: '42\n' }]),
    );
    expect(result.outcome).toBe('applied');
    expect(rendered(result.transcript)).toContain('42\n');
    expect(result.transcript.sequence).toBe(1);
  });

  it('ignores a duplicate and a replay', () => {
    const first = applyTerminalEvent(
      started(),
      append(1, [{ kind: 'out', text: '42\n' }]),
    ).transcript;

    for (const sequence of [0, 1]) {
      const again = applyTerminalEvent(
        first,
        append(sequence === 0 ? 1 : sequence, [{ kind: 'out', text: '42\n' }]),
      );
      expect(again.outcome).toBe('stale');
      expect(again.transcript).toBe(first);
    }
  });

  it('marks a gap instead of applying over a hole', () => {
    const gap = applyTerminalEvent(
      started(),
      append(3, [{ kind: 'out', text: 'later\n' }]),
    );
    expect(gap.outcome).toBe('gap');
    expect(gap.transcript.synchronizing).toBe(true);
    // The last certain state stays on screen; nothing uncertain is written.
    expect(rendered(gap.transcript)).toBe('$ python solution.py\n');
  });

  it('repairs a gap atomically from a snapshot', () => {
    const gap = applyTerminalEvent(
      started(),
      append(3, [{ kind: 'out', text: 'later\n' }]),
    ).transcript;

    const repaired = applyTerminalEvent(gap, {
      kind: 'snapshot',
      origin: 'STUDENT',
      draftId,
      clientRunId: runA,
      at,
      sequence: 3,
      lifecycle: 'STARTED',
      lines: [
        { kind: 'meta', text: '$ python solution.py\n' },
        { kind: 'out', text: 'first\n' },
        { kind: 'out', text: 'later\n' },
      ],
      passedCount: 0,
      sampleCount: 0,
      awaitingInput: true,
      truncated: false,
    });

    expect(repaired.outcome).toBe('applied');
    expect(repaired.transcript.synchronizing).toBe(false);
    expect(repaired.transcript.sequence).toBe(3);
    expect(repaired.transcript.awaitingInput).toBe(true);
    expect(rendered(repaired.transcript)).toBe(
      '$ python solution.py\nfirst\nlater\n',
    );

    // And the stream continues from the repaired sequence.
    const next = applyTerminalEvent(
      repaired.transcript,
      append(4, [{ kind: 'out', text: 'after\n' }]),
    );
    expect(next.outcome).toBe('applied');
  });

  it('replaces the transcript when a new run starts', () => {
    const first = applyTerminalEvent(
      started(),
      append(1, [{ kind: 'out', text: 'old\n' }]),
    ).transcript;

    const second = applyTerminalEvent(first, {
      kind: 'start',
      origin: 'STUDENT',
      draftId,
      clientRunId: runB,
      at,
      sequence: 0,
      lifecycle: 'STARTED',
      lines: [{ kind: 'meta', text: '$ python solution.py · Test 1\n' }],
      sampleCount: 2,
      awaitingInput: false,
    });

    expect(second.outcome).toBe('applied');
    expect(rendered(second.transcript)).toBe('$ python solution.py · Test 1\n');
    expect(second.transcript.sampleCount).toBe(2);
  });

  it('ignores a duplicate start of the run already on screen', () => {
    const transcript = started();
    const again = applyTerminalEvent(transcript, {
      kind: 'start',
      origin: 'STUDENT',
      draftId,
      clientRunId: runA,
      at,
      sequence: 0,
      lifecycle: 'STARTED',
      lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
      sampleCount: 0,
      awaitingInput: false,
    });
    expect(again.outcome).toBe('stale');
    expect(again.transcript).toBe(transcript);
  });

  it('never lets a replaced run overwrite the current one', () => {
    const first = applyTerminalEvent(
      started(runA),
      append(1, [{ kind: 'out', text: 'old\n' }]),
    ).transcript;
    const second = startTranscript(first, {
      clientRunId: runB,
      lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
      sampleCount: 0,
      awaitingInput: false,
    });

    // A straggler from the finished run, delivered late.
    const straggler = applyTerminalEvent(
      second,
      append(2, [{ kind: 'out', text: 'stale output\n' }], runA),
    );
    expect(straggler.outcome).toBe('stale');
    expect(rendered(straggler.transcript)).toBe('$ python solution.py\n');
    expect(straggler.transcript.synchronizing).toBe(false);
  });

  it('treats an unknown run as a gap rather than a beginning', () => {
    // The banner and everything before this line are missing, so extending it
    // would render a transcript the student never had.
    const result = applyTerminalEvent(
      emptyTranscript,
      append(7, [{ kind: 'out', text: 'mid-run\n' }], runB),
    );
    expect(result.outcome).toBe('gap');
    expect(result.transcript.synchronizing).toBe(true);
    expect(result.transcript.lines).toEqual([]);
  });

  it('carries the waiting state and the final lifecycle', () => {
    const waiting = applyTerminalEvent(started(), {
      kind: 'state',
      origin: 'STUDENT',
      draftId,
      clientRunId: runA,
      at,
      sequence: 1,
      awaitingInput: true,
    }).transcript;
    expect(waiting.awaitingInput).toBe(true);

    const finished = applyTerminalEvent(waiting, {
      kind: 'finish',
      origin: 'STUDENT',
      draftId,
      clientRunId: runA,
      at,
      sequence: 2,
      lifecycle: 'FAILED',
      passedCount: 0,
      sampleCount: 1,
      awaitingInput: false,
    }).transcript;
    expect(finished.lifecycle).toBe('FAILED');
    expect(finished.awaitingInput).toBe(false);
  });

  it('clears the mirror when the draft is replaced', () => {
    const cleared = applyTerminalEvent(started(), {
      kind: 'clear',
      origin: 'STUDENT',
      draftId,
      at,
    });
    expect(cleared.transcript).toEqual(emptyTranscript);
  });
});

describe('snapshotBody', () => {
  it('describes the transcript the student currently has', () => {
    const transcript = appendToTranscript(started(), [
      { kind: 'out', text: '42\n' },
    ]);
    expect(snapshotBody(transcript)).toEqual({
      sequence: 0,
      lifecycle: 'STARTED',
      lines: [
        { kind: 'meta', text: '$ python solution.py\n' },
        { kind: 'out', text: '42\n' },
      ],
      awaitingInput: false,
      passedCount: 0,
      sampleCount: 0,
      truncated: false,
    });
  });

  it('reports a sequence a schema accepts even before a run exists', () => {
    expect(snapshotBody(emptyTranscript).sequence).toBe(0);
  });

  it('snapshots the final public sample verdict rather than its initial counts', () => {
    const settled = settleTranscript(started(), {
      lifecycle: 'FAILED',
      passedCount: 0,
      sampleCount: 3,
    });
    expect(snapshotBody(settled)).toMatchObject({
      lifecycle: 'FAILED',
      passedCount: 0,
      sampleCount: 3,
      awaitingInput: false,
    });
  });
});

describe('normalizeLines', () => {
  it('is what both sides put on the wire', () => {
    const lines = normalizeLines([
      { kind: 'out', text: 'a' },
      { kind: 'out', text: 'b' },
    ]);
    expect(lines).toEqual([{ kind: 'out', text: 'ab' }]);
  });
});
