'use client';

import {
  monitoringServerEvents,
  monitoringTiming,
  type TerminalSnapshotRequest,
} from '@cove/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import type { TerminalTranscript } from '@/lib/workspace/terminal-transcript';
import type { TerminalEvent } from '@/lib/workspace/use-python-runner';

import { createTerminalMirror, type MirrorCursor } from './terminal-mirror';

/**
 * The student's terminal, on its way to a watching teacher.
 *
 * The only place in the student's workspace that knows both about a terminal
 * and about a socket, which is the point: the runner emits terminal events and
 * nothing else, and this adapter gives them a room, a deadline, and an answer
 * to a snapshot request. Nothing is published unless a teacher is actually
 * watching — without a draft room there is no room to publish into.
 */
export function useTerminalMirrorPublisher({
  draftId,
  socket,
  subscribeTerminal,
  readTranscript,
}: {
  /** The watched draft, or null when nobody is watching. */
  draftId: string | null;
  socket: Socket | null;
  subscribeTerminal: (listener: (event: TerminalEvent) => void) => () => void;
  readTranscript: () => TerminalTranscript;
}): void {
  // Outside the effect: a reconnection or a re-render must not restart the
  // numbering of a run already in flight.
  const cursorRef = React.useRef<MirrorCursor>({
    clientRunId: null,
    sequence: 0,
    bytes: 0,
    truncated: false,
  });

  React.useEffect(() => {
    if (!socket || !draftId) return;

    const mirror = createTerminalMirror({
      cursor: cursorRef.current,
      draftId,
      send: (event, payload) => socket.emit(event, payload),
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const disarm = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };
    const arm = () => {
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        mirror.flush();
      }, monitoringTiming.terminalBatchMaxDelayMs);
    };

    const onTerminalEvent = (event: TerminalEvent) => {
      if (mirror.handle(event) === 'pending') arm();
      else disarm();
    };

    const onSnapshotRequest = (request: TerminalSnapshotRequest) => {
      if (request?.draftId !== draftId) return;
      disarm();
      mirror.snapshot(readTranscript());
    };

    const onConnect = () => {
      const transcript = readTranscript();
      if (transcript.clientRunId) mirror.snapshot(transcript);
    };

    const unsubscribe = subscribeTerminal(onTerminalEvent);
    socket.on('connect', onConnect);
    socket.on(monitoringServerEvents.terminalSnapshotRequest, onSnapshotRequest);

    // A teacher who opened this workspace mid-run would otherwise wait for the
    // next execution to see anything. The server asks too, but its request can
    // arrive before this subscription exists — so the first thing a newly
    // watched terminal does is describe itself.
    if (readTranscript().clientRunId) mirror.snapshot(readTranscript());

    return () => {
      unsubscribe();
      socket.off('connect', onConnect);
      socket.off(
        monitoringServerEvents.terminalSnapshotRequest,
        onSnapshotRequest,
      );
      disarm();
    };
  }, [draftId, readTranscript, socket, subscribeTerminal]);
}
