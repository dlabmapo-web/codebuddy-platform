import {
  monitoringClientEvents,
  monitoringLimits,
  terminalByteLength,
  terminalLinesByteLength,
  type TerminalLine,
} from '@cove/shared';

import {
  normalizeLines,
  snapshotBody,
  type TerminalTranscript,
} from '@/lib/workspace/terminal-transcript';
import type { TerminalEvent } from '@/lib/workspace/use-python-runner';

/**
 * Terminal events in, numbered mirror messages out.
 *
 * Pure and synchronous on purpose: batching, splitting, and numbering are the
 * parts of publishing that can be wrong in ways nobody notices until a
 * teacher's transcript disagrees with a student's screen, so they are testable
 * without a socket, a timer, or a browser. The hook around this owns exactly
 * two things it cannot: when the deadline fires, and where the messages go.
 */

export type MirrorSend = (event: string, payload: unknown) => void;

/**
 * The run being mirrored and the last number sent for it.
 *
 * Owned by the caller so it survives a reconnection: numbering that restarted
 * mid-run would look, to the gateway, exactly like a client replaying old
 * output over a newer transcript.
 */
export type MirrorCursor = {
  clientRunId: string | null;
  sequence: number;
  /** Logical content bytes already sent for this run. */
  bytes: number;
  /** True after the one batch that crossed the content budget. */
  truncated: boolean;
};

/** Whether the caller should be holding a flush deadline after this call. */
export type MirrorPending = 'pending' | 'idle';

export function createTerminalMirror({
  cursor,
  draftId,
  now = () => new Date().toISOString(),
  send,
}: {
  cursor: MirrorCursor;
  draftId: string;
  now?: () => string;
  send: MirrorSend;
}) {
  let pending: TerminalLine[] = [];
  let pendingBytes = 0;

  /**
   * One delta, or several when a batch outgrows the wire limit.
   *
   * Splitting by byte budget rather than by line keeps a single enormous
   * `print` from becoming a message no schema will accept, and each part takes
   * its own number so the receiver still applies them in order.
   */
  const flush = (): void => {
    const lines = pending.length > 0 ? normalizeLines(pending) : [];
    pending = [];
    pendingBytes = 0;
    if (lines.length === 0 || !cursor.clientRunId || cursor.truncated) return;

    let batch: TerminalLine[] = [];
    let batchBytes = 0;
    const emitBatch = () => {
      if (batch.length === 0) return;
      cursor.sequence += 1;
      send(monitoringClientEvents.terminalAppend, {
        kind: 'append',
        draftId,
        clientRunId: cursor.clientRunId,
        sequence: cursor.sequence,
        at: now(),
        lines: batch,
      });
      const crossed =
        cursor.bytes + batchBytes > monitoringLimits.terminalTranscriptMaxBytes;
      cursor.bytes = Math.min(
        monitoringLimits.terminalTranscriptMaxBytes,
        cursor.bytes + batchBytes,
      );
      cursor.truncated = crossed;
      batch = [];
      batchBytes = 0;
    };

    for (const line of lines) {
      const size = terminalByteLength(line.text);
      if (
        batch.length >= monitoringLimits.terminalLinesPerDelta ||
        (batchBytes > 0 &&
          batchBytes + size > monitoringLimits.terminalDeltaMaxBytes)
      ) {
        emitBatch();
        if (cursor.truncated) break;
      }
      batch.push(line);
      batchBytes += size;
    }
    if (!cursor.truncated) emitBatch();
  };

  return {
    /**
     * Folds one terminal event in, and says whether output is still waiting.
     *
     * `pending` means a batch is being accumulated and the caller owes it a
     * deadline; `idle` means everything so far is already on the wire.
     */
    handle(event: TerminalEvent): MirrorPending {
      switch (event.type) {
        case 'reset': {
          flush();
          cursor.clientRunId = event.clientRunId;
          cursor.sequence = 0;
          cursor.bytes = terminalLinesByteLength(normalizeLines(event.lines));
          cursor.truncated = false;
          send(monitoringClientEvents.terminalStart, {
            kind: 'start',
            draftId,
            clientRunId: event.clientRunId,
            sequence: 0,
            at: now(),
            lifecycle: 'STARTED',
            lines: normalizeLines(event.lines),
            sampleCount: event.sampleCount,
            awaitingInput: event.awaitingInput,
          });
          return 'idle';
        }
        case 'append': {
          if (!cursor.clientRunId) return 'idle';
          for (const line of event.lines) {
            if (line.text === '') continue;
            pending.push(line);
            pendingBytes += terminalByteLength(line.text);
          }
          // A full batch leaves immediately; anything smaller waits for
          // company, but never longer than a reader would notice.
          if (pendingBytes >= monitoringLimits.terminalDeltaMaxBytes) {
            flush();
            return 'idle';
          }
          return pending.length > 0 ? 'pending' : 'idle';
        }
        case 'waiting': {
          if (!cursor.clientRunId) return 'idle';
          // Output first: a waiting indicator that arrived before the prompt it
          // belongs to would read as the program stalling for no reason.
          flush();
          cursor.sequence += 1;
          send(monitoringClientEvents.terminalState, {
            kind: 'state',
            draftId,
            clientRunId: cursor.clientRunId,
            sequence: cursor.sequence,
            at: now(),
            awaitingInput: event.awaitingInput,
          });
          return 'idle';
        }
        case 'finish': {
          if (!cursor.clientRunId) return 'idle';
          flush();
          cursor.sequence += 1;
          send(monitoringClientEvents.terminalFinish, {
            kind: 'finish',
            draftId,
            clientRunId: cursor.clientRunId,
            sequence: cursor.sequence,
            at: now(),
            lifecycle: event.lifecycle,
            passedCount: event.passedCount,
            sampleCount: event.sampleCount,
            awaitingInput: false,
          });
          return 'idle';
        }
        case 'clear': {
          flush();
          cursor.clientRunId = null;
          cursor.sequence = 0;
          cursor.bytes = 0;
          cursor.truncated = false;
          send(monitoringClientEvents.terminalClear, {
            kind: 'clear',
            draftId,
            at: now(),
          });
          return 'idle';
        }
      }
    },

    flush,

    /**
     * The whole transcript, in answer to a request.
     *
     * Anything buffered goes first, so the snapshot's sequence describes a
     * state the receiver can continue from rather than one already superseded.
     */
    snapshot(transcript: TerminalTranscript): void {
      flush();
      if (!transcript.clientRunId) {
        // Nothing has run on this draft. Saying so is honest; inventing an
        // empty run is not.
        send(monitoringClientEvents.terminalClear, {
          kind: 'clear',
          draftId,
          at: now(),
        });
        return;
      }
      if (cursor.clientRunId !== transcript.clientRunId) {
        // A run that began before anybody was watching. Its numbering starts
        // with this snapshot.
        cursor.clientRunId = transcript.clientRunId;
        cursor.sequence = 0;
      }
      cursor.bytes = Math.min(
        monitoringLimits.terminalTranscriptMaxBytes,
        transcript.bytes,
      );
      cursor.truncated = transcript.truncated;
      send(monitoringClientEvents.terminalSnapshot, {
        kind: 'snapshot',
        draftId,
        clientRunId: cursor.clientRunId,
        at: now(),
        ...snapshotBody(transcript),
        sequence: cursor.sequence,
      });
    },

    /** Bytes waiting for a deadline. Exposed for tests and for assertions. */
    get pendingBytes() {
      return pendingBytes;
    },
  };
}
