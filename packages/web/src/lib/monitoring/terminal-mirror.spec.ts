import {
  monitoringClientEvents,
  monitoringLimits,
  terminalAppendMessageSchema,
  terminalLinesByteLength,
  terminalMirrorMessageSchema,
} from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  appendToTranscript,
  startTranscript,
  emptyTranscript,
} from '@/lib/workspace/terminal-transcript';
import type { TerminalEvent } from '@/lib/workspace/use-python-runner';

import { createTerminalMirror, type MirrorCursor } from './terminal-mirror';

/**
 * What the student publishes, and when.
 *
 * Every message here is validated against the wire schema rather than compared
 * to a hand-written object: a publisher that produced something the gateway
 * would reject is a mirror that silently stops updating, and that is precisely
 * the failure this protocol replaced.
 */

const draftId = '44444444-4444-4444-8444-444444444444';
const runA = '55555555-5555-4555-8555-555555555555';
const at = '2026-08-06T10:00:00.000Z';

function harness(
  cursor: MirrorCursor = {
    clientRunId: null,
    sequence: 0,
    bytes: 0,
    truncated: false,
  },
) {
  const sent: { event: string; payload: Record<string, unknown> }[] = [];
  const mirror = createTerminalMirror({
    cursor,
    draftId,
    now: () => at,
    send: (event, payload) =>
      sent.push({ event, payload: payload as Record<string, unknown> }),
  });
  return { cursor, mirror, sent };
}

const reset: TerminalEvent = {
  type: 'reset',
  clientRunId: runA,
  lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
  sampleCount: 0,
  awaitingInput: false,
};

describe('createTerminalMirror', () => {
  it('publishes only messages the wire contract accepts', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({ type: 'append', lines: [{ kind: 'out', text: '42\n' }] });
    mirror.flush();
    mirror.handle({ type: 'waiting', awaitingInput: true });
    mirror.handle({
      type: 'finish',
      lifecycle: 'COMPLETED',
      passedCount: 1,
      sampleCount: 1,
    });

    expect(sent.map((message) => message.event)).toEqual([
      monitoringClientEvents.terminalStart,
      monitoringClientEvents.terminalAppend,
      monitoringClientEvents.terminalState,
      monitoringClientEvents.terminalFinish,
    ]);
    for (const message of sent) {
      expect(terminalMirrorMessageSchema.safeParse(message.payload)).toMatchObject({
        success: true,
      });
    }
  });

  it('numbers one run consecutively from zero', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    for (const text of ['a\n', 'b\n', 'c\n']) {
      mirror.handle({ type: 'append', lines: [{ kind: 'out', text }] });
      mirror.flush();
    }
    mirror.handle({
      type: 'finish',
      lifecycle: 'COMPLETED',
      passedCount: 0,
      sampleCount: 0,
    });

    expect(sent.map((message) => message.payload.sequence)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it('holds a small batch until the deadline the caller owns', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);

    // Buffered, and the caller is told to arm its deadline rather than the
    // module reaching for a timer of its own.
    expect(
      mirror.handle({ type: 'append', lines: [{ kind: 'out', text: 'x' }] }),
    ).toBe('pending');
    expect(sent).toHaveLength(1);

    mirror.flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.payload).toMatchObject({
      kind: 'append',
      lines: [{ kind: 'out', text: 'x' }],
    });
  });

  it('coalesces a frame of chunks into one delta', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({
      type: 'append',
      lines: [
        { kind: 'out', text: 'Hel' },
        { kind: 'out', text: 'lo, ' },
        { kind: 'out', text: 'world\n' },
      ],
    });
    mirror.flush();

    expect(sent).toHaveLength(2);
    expect(sent[1]!.payload.lines).toEqual([
      { kind: 'out', text: 'Hello, world\n' },
    ]);
  });

  it('flushes a full batch immediately rather than waiting', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);

    const pending = mirror.handle({
      type: 'append',
      lines: [
        { kind: 'out', text: 'q'.repeat(monitoringLimits.terminalDeltaMaxBytes) },
      ],
    });

    expect(pending).toBe('idle');
    expect(sent).toHaveLength(2);
    expect(mirror.pendingBytes).toBe(0);
  });

  it('splits an oversized batch into deltas the schema accepts', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({
      type: 'append',
      lines: [
        { kind: 'out', text: 'w'.repeat(monitoringLimits.terminalDeltaMaxBytes * 3) },
      ],
    });
    mirror.flush();

    const deltas = sent.slice(1);
    expect(deltas.length).toBeGreaterThan(1);
    for (const delta of deltas) {
      expect(terminalAppendMessageSchema.safeParse(delta.payload).success).toBe(
        true,
      );
    }
    // Consecutive, so the receiver can apply them without asking for a repair.
    expect(deltas.map((delta) => delta.payload.sequence)).toEqual(
      deltas.map((_, index) => index + 1),
    );
  });

  it('sends one crossing batch and drops output after the transcript ceiling', () => {
    const { cursor, mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({
      type: 'append',
      lines: [
        {
          kind: 'out',
          text: 'x'.repeat(monitoringLimits.terminalTranscriptMaxBytes * 2),
        },
      ],
    });
    mirror.flush();

    const deltas = sent
      .filter((message) => message.event === monitoringClientEvents.terminalAppend)
      .map((message) => message.payload);
    const bytes = deltas.reduce(
      (total, delta) =>
        total + terminalLinesByteLength(delta.lines as never),
      terminalLinesByteLength(reset.lines),
    );
    expect(bytes).toBeGreaterThan(monitoringLimits.terminalTranscriptMaxBytes);
    expect(bytes).toBeLessThanOrEqual(
      monitoringLimits.terminalTranscriptMaxBytes +
        monitoringLimits.terminalDeltaMaxBytes,
    );
    expect(cursor.truncated).toBe(true);

    const countAtBoundary = sent.length;
    mirror.handle({
      type: 'append',
      lines: [{ kind: 'out', text: 'never mirrored\n' }],
    });
    mirror.flush();
    mirror.handle({
      type: 'finish',
      lifecycle: 'CANCELLED',
      passedCount: 0,
      sampleCount: 0,
    });
    expect(sent).toHaveLength(countAtBoundary + 1);
    expect(sent.at(-1)?.payload).toMatchObject({
      kind: 'finish',
      sequence: cursor.sequence,
    });
  });

  it('puts buffered output on the wire before a state change', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({
      type: 'append',
      lines: [{ kind: 'out', text: 'Enter a number: ' }],
    });
    // A waiting indicator that arrived before its prompt would read as the
    // program stalling for no reason.
    mirror.handle({ type: 'waiting', awaitingInput: true });

    expect(sent.map((message) => message.payload.kind)).toEqual([
      'start',
      'append',
      'state',
    ]);
  });

  it('never publishes a run it has not seen begin', () => {
    const { mirror, sent } = harness();
    mirror.handle({ type: 'append', lines: [{ kind: 'out', text: 'orphan\n' }] });
    mirror.handle({ type: 'waiting', awaitingInput: true });
    mirror.flush();
    expect(sent).toHaveLength(0);
  });

  it('answers a snapshot request with the transcript and its own number', () => {
    const { cursor, mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({ type: 'append', lines: [{ kind: 'out', text: '42\n' }] });

    const transcript = appendToTranscript(
      startTranscript(emptyTranscript, {
        clientRunId: runA,
        lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
        sampleCount: 0,
        awaitingInput: false,
      }),
      [{ kind: 'out', text: '42\n' }],
    );
    mirror.snapshot(transcript);

    // The buffered delta went first, so the snapshot's number describes a state
    // the receiver can carry on from.
    expect(sent.map((message) => message.payload.kind)).toEqual([
      'start',
      'append',
      'snapshot',
    ]);
    const snapshot = sent[2]!.payload;
    expect(snapshot.sequence).toBe(cursor.sequence);
    expect(snapshot.lines).toEqual([
      { kind: 'meta', text: '$ python solution.py\n' },
      { kind: 'out', text: '42\n' },
    ]);
    expect(terminalMirrorMessageSchema.safeParse(snapshot).success).toBe(true);
  });

  it('answers for a run that began before anybody was watching', () => {
    // The publisher was created mid-run: it has numbered nothing, and the
    // snapshot is what establishes the run for the teacher.
    const { mirror, sent } = harness();
    mirror.snapshot(
      startTranscript(emptyTranscript, {
        clientRunId: runA,
        lines: [{ kind: 'meta', text: '$ python solution.py\n' }],
        sampleCount: 0,
        awaitingInput: true,
      }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({
      kind: 'snapshot',
      clientRunId: runA,
      sequence: 0,
      awaitingInput: true,
    });
  });

  it('says the mirror is empty rather than inventing a run', () => {
    const { mirror, sent } = harness();
    mirror.snapshot(emptyTranscript);
    expect(sent[0]).toMatchObject({
      event: monitoringClientEvents.terminalClear,
      payload: { kind: 'clear' },
    });
  });

  it('continues the numbering of a run in flight across a reconnection', () => {
    const cursor: MirrorCursor = {
      clientRunId: null,
      sequence: 0,
      bytes: 0,
      truncated: false,
    };
    const first = harness(cursor);
    first.mirror.handle(reset);
    first.mirror.handle({ type: 'append', lines: [{ kind: 'out', text: 'a\n' }] });
    first.mirror.flush();

    // A second publisher over the same cursor, as a re-created effect would be.
    const second = harness(cursor);
    second.mirror.handle({ type: 'append', lines: [{ kind: 'out', text: 'b\n' }] });
    second.mirror.flush();

    expect(second.sent[0]!.payload.sequence).toBe(2);
  });

  it('carries no identity, room, or grading data in any message', () => {
    const { mirror, sent } = harness();
    mirror.handle(reset);
    mirror.handle({ type: 'append', lines: [{ kind: 'out', text: '42\n' }] });
    mirror.flush();
    mirror.handle({
      type: 'finish',
      lifecycle: 'COMPLETED',
      passedCount: 1,
      sampleCount: 1,
    });

    for (const message of sent) {
      for (const key of [
        'academyId',
        'studentMembershipId',
        'membershipId',
        'room',
        'origin',
        'expectedOutput',
        'token',
      ]) {
        expect(message.payload).not.toHaveProperty(key);
      }
    }
  });
});
