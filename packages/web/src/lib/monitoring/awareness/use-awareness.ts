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

import {
  observeSurfaceIframes,
  type PointerCaptureSurface,
  type PointerViewportPoint,
} from './iframe-pointer-capture';
import {
  scheduleRemotePointerExpiry,
  type RemotePointerLifecycle,
} from './pointer-lifecycle';
import { resolvePointerSurface, toSurfaceFraction } from './surfaces';

export type RemoteAwareness = {
  cursor: CollaborationCursor | null;
  pointer: CollaborationPointer | null;
  /** Changes only with the pointer, so cursor traffic cannot prolong it. */
  pointerMovedAt: number;
};

/** Kept with the document it was measured against, so it can be disowned. */
type ReceivedAwareness = RemoteAwareness & { draftId: string | null };

const idle: ReceivedAwareness = {
  draftId: null,
  cursor: null,
  pointer: null,
  pointerMovedAt: 0,
};

/**
 * One person's half of shared presence: what this browser sends, and what the
 * other browser is doing right now.
 *
 * Both sides run the same hook. The teacher watches a student and the student
 * is watched, but neither direction is privileged here — the server stamps the
 * origin on the way through, and each client renders only the other's.
 *
 * Nothing is persisted and nothing is queued. A cursor that arrives late is
 * worse than one that never arrives, so movement is volatile and the last
 * position always wins. Saying the mouse has *gone* is the exception: that one
 * is reliable, because a dropped clear leaves an arrow asserting a position
 * nobody is at any more.
 *
 * How long the peer's arrow survives silence is the caller's decision, not
 * this hook's — see `remotePointer`.
 */
export function useAwareness({
  draftId,
  peerOrigin,
  remotePointer,
  socket,
}: {
  /** Null until a shared document exists; publishing is off until then. */
  draftId: string | null;
  peerOrigin: AwarenessChangedEvent['origin'];
  /** Whether the peer's arrow fades on silence or waits to be cleared. */
  remotePointer: RemotePointerLifecycle;
  socket: Socket | null;
}): {
  remote: RemoteAwareness;
  publishCursor: (cursor: CollaborationCursor | null) => void;
} {
  const [received, setReceived] = React.useState<ReceivedAwareness>(idle);

  // Handlers outlive the render that created them, so the parts that change
  // often are read through refs rather than closed over.
  const draftRef = React.useRef(draftId);
  const pointerRef = React.useRef<CollaborationPointer | null>(null);
  const cursorRef = React.useRef<CollaborationCursor | null>(null);
  const lastPointerAt = React.useRef(0);
  const lastCursorAt = React.useRef(0);
  const pointerFlushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cursorFlushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const cancelPointerFlush = React.useCallback(() => {
    if (pointerFlushTimer.current) clearTimeout(pointerFlushTimer.current);
    pointerFlushTimer.current = null;
  }, []);

  const cancelCursorFlush = React.useCallback(() => {
    if (cursorFlushTimer.current) clearTimeout(cursorFlushTimer.current);
    cursorFlushTimer.current = null;
  }, []);

  React.useEffect(() => {
    cancelPointerFlush();
    cancelCursorFlush();
    lastPointerAt.current = 0;
    lastCursorAt.current = 0;
    draftRef.current = draftId;
    if (draftId) return;
    pointerRef.current = null;
    cursorRef.current = null;
  }, [cancelCursorFlush, cancelPointerFlush, draftId]);

  React.useEffect(() => cancelPointerFlush, [cancelPointerFlush]);
  React.useEffect(() => cancelCursorFlush, [cancelCursorFlush]);

  /**
   * Without this shared document there is no peer.
   *
   * Derived rather than cleared: a watch that ends — or is replaced by another
   * one, without ever passing through nothing in between — must not leave the
   * other person's last position frozen on screen, and matching the document
   * it was measured against means there is no window at all in which a stale
   * caret or a stale arrow could be rendered. It also means no timer has to be
   * cancelled to make that true, which matters for the arrow that has none.
   */
  const remote: RemoteAwareness =
    draftId !== null && received.draftId === draftId ? received : idle;

  /**
   * @param reliable Movement is volatile: the next event supersedes this one
   *   within eighty milliseconds, so a dropped frame costs nothing. A clear is
   *   not superseded by anything — a peer whose pointer does not expire would
   *   be left holding the last position forever — so it is sent on the
   *   ordinary channel and buffered across a reconnection.
   */
  const send = React.useCallback(
    (reliable = false) => {
      const currentDraft = draftRef.current;
      if (!socket || !currentDraft) return;
      const channel = reliable ? socket : socket.volatile;
      channel.emit(monitoringClientEvents.awarenessUpdate, {
        draftId: currentDraft,
        cursor: cursorRef.current,
        pointer: pointerRef.current,
      });
    },
    [socket],
  );

  /* ------------------------------------------------------------- outgoing */

  const publishCursor = React.useCallback(
    (cursor: CollaborationCursor | null) => {
      cursorRef.current = cursor;
      const now = Date.now();
      const remaining =
        monitoringTiming.cursorIntervalMs - (now - lastCursorAt.current);
      if (remaining <= 0) {
        cancelCursorFlush();
        lastCursorAt.current = now;
        send();
        return;
      }
      // A leading-edge-only throttle can permanently lose the final caret
      // when a click and a keystroke land inside one interval. Keep one
      // trailing send so the teacher always converges on the student's exact
      // last line and column without increasing the event rate.
      if (cursorFlushTimer.current) return;
      cursorFlushTimer.current = setTimeout(() => {
        cursorFlushTimer.current = null;
        lastCursorAt.current = Date.now();
        send();
      }, remaining);
    },
    [cancelCursorFlush, send],
  );

  const publishPointer = React.useCallback(
    (pointer: CollaborationPointer | null) => {
      pointerRef.current = pointer;
      if (!pointer) {
        cancelPointerFlush();
        send(true);
        return;
      }

      const now = Date.now();
      const remaining =
        monitoringTiming.pointerIntervalMs - (now - lastPointerAt.current);
      if (remaining <= 0) {
        cancelPointerFlush();
        lastPointerAt.current = now;
        send();
        return;
      }
      // Movement is sampled, but the last sample is never discarded. A quick
      // move into an iframe or onto a new line must still converge on the
      // student's final position after the throttle window closes.
      if (pointerFlushTimer.current) return;
      pointerFlushTimer.current = setTimeout(() => {
        pointerFlushTimer.current = null;
        lastPointerAt.current = Date.now();
        send();
      }, remaining);
    },
    [cancelPointerFlush, send],
  );

  React.useEffect(() => {
    if (!socket || !draftId || typeof document === 'undefined') return;

    const leave = () => {
      if (!pointerRef.current) return;
      publishPointer(null);
    };

    const publishPoint = (
      point: PointerViewportPoint,
      resolved: PointerCaptureSurface | null,
    ) => {
      if (!resolved) {
        // Off every collaboration surface — the browser chrome, a modal, a gap
        // between panes. Reporting the last known position would leave the
        // peer's arrow stuck on a pane the sender has left.
        leave();
        return;
      }
      const position = toSurfaceFraction(
        point,
        resolved.element.getBoundingClientRect(),
      );
      if (!position) return;
      publishPointer({ surface: resolved.surface, ...position });
    };

    const onPointerMove = (event: PointerEvent) => {
      publishPoint(event, resolvePointerSurface(event.target));
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
    const stopObservingFrames = observeSurfaceIframes({
      onLeave: leave,
      onPointerMove: publishPoint,
    });
    return () => {
      leave();
      stopObservingFrames();
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerleave', leave, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
    };
  }, [draftId, publishPointer, socket]);

  /* ------------------------------------------------------------- incoming */

  React.useEffect(() => {
    if (!socket) return;
    const onAwareness = (event: AwarenessChangedEvent) => {
      if (event.origin !== peerOrigin) return;
      setReceived((current) => ({
        draftId: event.draftId,
        cursor: event.cursor,
        pointer: event.pointer,
        // Cursor and pointer share one compact wire event. A cursor-only
        // update repeats the last pointer, but it is not mouse movement and
        // must not restart the student's three-second teacher-pointer timer.
        pointerMovedAt:
          current.draftId === event.draftId &&
          samePointer(current.pointer, event.pointer)
            ? current.pointerMovedAt
            : Date.now(),
      }));
    };
    socket.on(monitoringServerEvents.awarenessChanged, onAwareness);
    return () => {
      socket.off(monitoringServerEvents.awarenessChanged, onAwareness);
    };
  }, [peerOrigin, socket]);

  /**
   * A pointer that stopped arriving disappears — where the caller asked for it.
   *
   * When it does expire, the peer may have moved off a surface during a
   * dropped frame, switched tabs, or lost the connection, and in every one of
   * those cases an arrow left hovering over the code is claiming something
   * that is no longer true. When it does not, the position is held until
   * somebody says otherwise: the sender's own leave event, or the gateway
   * speaking for a connection that can no longer speak for itself.
   *
   * The caret is not expired with it either way — a caret marks a place in the
   * document, and it is still where they left it.
   */
  React.useEffect(
    () =>
      // Measured from what is on screen, not from what arrived: awareness for
      // a document this hook has already left is never counted down, and
      // never reaches back into state to remove something it does not own.
      scheduleRemotePointerExpiry(remotePointer, remote.pointer, () =>
        setReceived((current) => ({ ...current, pointer: null })),
      ),
    [remote.pointer, remote.pointerMovedAt, remotePointer],
  );

  return { remote, publishCursor };
}

function samePointer(
  left: CollaborationPointer | null,
  right: CollaborationPointer | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.surface === right.surface && left.x === right.x && left.y === right.y
  );
}
