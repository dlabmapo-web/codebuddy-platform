'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  monitoringTiming,
  type AwarenessChangedEvent,
  type CollaborationCursor,
  type CollaborationPointer,
} from '@cove/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { resolvePointerSurface, toSurfaceFraction } from './surfaces';

export type RemoteAwareness = {
  cursor: CollaborationCursor | null;
  pointer: CollaborationPointer | null;
  /** Rises on every arrival, so a label can fade on a peer who stopped. */
  movedAt: number;
};

const idle: RemoteAwareness = { cursor: null, pointer: null, movedAt: 0 };

/**
 * One person's half of shared presence: what this browser sends, and what the
 * other browser is doing right now.
 *
 * Both sides run the same hook. The teacher watches a student and the student
 * is watched, but neither direction is privileged here — the server stamps the
 * origin on the way through, and each client renders only the other's.
 *
 * Nothing is persisted and nothing is queued. A cursor that arrives late is
 * worse than one that never arrives, so every send is volatile and the last
 * position always wins.
 */
export function useAwareness({
  draftId,
  peerOrigin,
  socket,
}: {
  /** Null until a shared document exists; publishing is off until then. */
  draftId: string | null;
  peerOrigin: AwarenessChangedEvent['origin'];
  socket: Socket | null;
}): {
  remote: RemoteAwareness;
  publishCursor: (cursor: CollaborationCursor | null) => void;
} {
  const [received, setReceived] = React.useState<RemoteAwareness>(idle);

  // Handlers outlive the render that created them, so the parts that change
  // often are read through refs rather than closed over.
  const draftRef = React.useRef(draftId);
  const pointerRef = React.useRef<CollaborationPointer | null>(null);
  const cursorRef = React.useRef<CollaborationCursor | null>(null);
  const lastPointerAt = React.useRef(0);
  const lastCursorAt = React.useRef(0);

  React.useEffect(() => {
    draftRef.current = draftId;
    if (draftId) return;
    pointerRef.current = null;
    cursorRef.current = null;
  }, [draftId]);

  /**
   * Without a shared document there is no peer.
   *
   * Derived rather than cleared: a watch that ends must not leave the other
   * person's last position frozen on screen, and deriving it means there is no
   * window at all in which a stale caret could be rendered.
   */
  const remote = draftId ? received : idle;

  const send = React.useCallback(() => {
    const currentDraft = draftRef.current;
    if (!socket || !currentDraft) return;
    socket.volatile.emit(monitoringClientEvents.awarenessUpdate, {
      draftId: currentDraft,
      cursor: cursorRef.current,
      pointer: pointerRef.current,
    });
  }, [socket]);

  /* ------------------------------------------------------------- outgoing */

  const publishCursor = React.useCallback(
    (cursor: CollaborationCursor | null) => {
      cursorRef.current = cursor;
      const now = Date.now();
      if (now - lastCursorAt.current < monitoringTiming.cursorIntervalMs) return;
      lastCursorAt.current = now;
      send();
    },
    [send],
  );

  React.useEffect(() => {
    if (!socket || !draftId || typeof document === 'undefined') return;

    const leave = () => {
      if (!pointerRef.current) return;
      pointerRef.current = null;
      send();
    };

    const onPointerMove = (event: PointerEvent) => {
      const resolved = resolvePointerSurface(event.target);
      if (!resolved) {
        // Off every collaboration surface — the browser chrome, a modal, a gap
        // between panes. Reporting the last known position would leave the
        // peer's arrow stuck on a pane the sender has left.
        leave();
        return;
      }
      // Coalesced here rather than on the server: an uncoalesced pointer is a
      // hundred events a second, and none of them are worth more than the last.
      const now = Date.now();
      if (now - lastPointerAt.current < monitoringTiming.pointerIntervalMs) return;
      const position = toSurfaceFraction(
        event,
        resolved.element.getBoundingClientRect(),
      );
      if (!position) return;
      lastPointerAt.current = now;
      pointerRef.current = { surface: resolved.surface, ...position };
      send();
    };

    const onVisibility = () => {
      if (document.hidden) leave();
    };

    // Capture phase: Monaco and the terminal stop propagation of their own
    // pointer handling, and a listener on the bubble phase would go silent
    // over exactly the two panes that matter most.
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerleave', leave, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    return () => {
      leave();
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerleave', leave, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
    };
  }, [draftId, send, socket]);

  /* ------------------------------------------------------------- incoming */

  React.useEffect(() => {
    if (!socket) return;
    const onAwareness = (event: AwarenessChangedEvent) => {
      if (event.origin !== peerOrigin) return;
      setReceived({
        cursor: event.cursor,
        pointer: event.pointer,
        movedAt: Date.now(),
      });
    };
    socket.on(monitoringServerEvents.awarenessChanged, onAwareness);
    return () => {
      socket.off(monitoringServerEvents.awarenessChanged, onAwareness);
    };
  }, [peerOrigin, socket]);

  /**
   * A pointer that stopped arriving disappears.
   *
   * The peer may have moved off a surface during a dropped frame, switched
   * tabs, or lost the connection; in every one of those cases an arrow left
   * hovering over the code is claiming something that is no longer true. The
   * caret is deliberately not expired with it — a caret marks a place in the
   * document, and it is still where they left it.
   */
  React.useEffect(() => {
    if (!received.pointer) return;
    const timer = setTimeout(
      () => setReceived((current) => ({ ...current, pointer: null })),
      monitoringTiming.pointerExpiryMs,
    );
    return () => clearTimeout(timer);
  }, [received]);

  return { remote, publishCursor };
}
