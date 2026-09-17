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

import { captureCodePointer } from './code-pointer';
import { idleAwarenessState } from './awareness-state';
import {
  expirePeerMarker,
  noPeers,
  peersOn,
  receivePeerAwareness,
  type PeerAwarenessMap,
  type PeerAwarenessState,
} from './peer-awareness';
import {
  observeSurfaceIframes,
  type PointerCaptureSurface,
  type PointerViewportPoint,
} from './iframe-pointer-capture';
import {
  scheduleRemoteAwarenessExpiry,
  type RemoteAwarenessLifecycle,
} from './pointer-lifecycle';
import {
  canvasLayoutReady,
  pointerBoxFor,
  resolvePointerAnchor,
  resolvePointerSurface,
  toCanvasPosition,
  toSurfaceFraction,
} from './surfaces';

/**
 * One sequence across every exercise hook that reuses an academy socket.
 * A component-local counter would restart after navigation while the server's
 * connection-local high-water mark correctly remains in place.
 */
const awarenessSequences = new WeakMap<Socket, number>();

function nextAwarenessSequence(socket: Socket): number {
  const sequence = (awarenessSequences.get(socket) ?? -1) + 1;
  awarenessSequences.set(socket, sequence);
  return sequence;
}

/**
 * Effect keys that change when a marker or its activity stamp does.
 *
 * React compares dependencies by identity, and the peer array is rebuilt on
 * every packet — so without these, every teacher's countdown would restart
 * whenever any one of them moved, and an idle arrow would never expire.
 */
function peerPointerKey(peers: PeerAwarenessState[]): string {
  return peers
    .map((peer) => `${peer.peerId}:${peer.pointer ? peer.pointerMovedAt : 0}`)
    .join('|');
}

function peerCursorKey(peers: PeerAwarenessState[]): string {
  return peers
    .map((peer) => `${peer.peerId}:${peer.cursor ? peer.cursorMovedAt : 0}`)
    .join('|');
}

export type RemoteAwareness = {
  cursor: CollaborationCursor | null;
  pointer: CollaborationPointer | null;
  /** Changes only with the Monaco caret, independently of mouse traffic. */
  cursorMovedAt: number;
  /** Changes only with the pointer, so cursor traffic cannot prolong it. */
  pointerMovedAt: number;
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
  identity,
  peerOrigin,
  remoteCursor,
  remotePointer,
  socket,
}: {
  /** Null until a shared document exists; publishing is off until then. */
  draftId: string | null;
  /**
   * Which watch this client's own packets belong to, when it holds one.
   *
   * Null for a student, who has no watch to fence. For a teacher it is what
   * lets the server drop a packet published before a reconnect instead of
   * forwarding it into the session that replaced it.
   */
  identity?: {
    sessionId: string;
    visitId: string;
    generation: number;
  } | null;
  peerOrigin: AwarenessChangedEvent['origin'];
  /** Whether the peer's Monaco caret expires or stays until an explicit clear. */
  remoteCursor: RemoteAwarenessLifecycle;
  /** Whether the peer's arrow fades on silence or waits to be cleared. */
  remotePointer: RemoteAwarenessLifecycle;
  socket: Socket | null;
}): {
  /**
   * The peer to render when there can only be one.
   *
   * A teacher watches one student, so their side genuinely has a single peer
   * and reads this. A student may be watched by several teachers at once and
   * reads `peers` instead; this reports the first of them so that callers
   * which have not been taught about the plural case still show something
   * true rather than nothing.
   */
  remote: RemoteAwareness;
  /** Every peer on this document, each with independent markers. */
  peers: PeerAwarenessState[];
  publishCursor: (cursor: CollaborationCursor | null) => void;
} {
  const [received, setReceived] = React.useState<PeerAwarenessMap>(noPeers);

  // Handlers outlive the render that created them, so the parts that change
  // often are read through refs rather than closed over.
  const draftRef = React.useRef(draftId);
  /**
   * Which watch this client's packets belong to, read by handlers that outlive
   * the render that created them.
   *
   * Synchronized in the *first* effect this hook declares, which is what makes
   * it safe: effects run in declaration order, so by the time any publisher
   * below — or any event handler, which runs later still — reads this, it
   * already holds the identity of the commit it is running in. A packet can
   * therefore never carry the generation of a watch that has just been
   * replaced, which is exactly the case the server would drop.
   */
  const identityRef = React.useRef(identity);
  React.useEffect(() => {
    identityRef.current = identity;
  }, [identity]);
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
    const previousDraftId = draftRef.current;
    cancelPointerFlush();
    cancelCursorFlush();
    lastPointerAt.current = 0;
    lastCursorAt.current = 0;
    draftRef.current = draftId;
    if (previousDraftId !== draftId) {
      // Awareness coordinates belong to one document. A direct transition
      // between two non-null drafts must not attach either half of the old
      // position to the first packet emitted for the new draft.
      pointerRef.current = null;
      cursorRef.current = null;
    }
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
   * cancelled to make that true, which matters for markers configured without
   * an idle expiry.
   */
  const peers = React.useMemo(
    () => peersOn(received, draftId),
    [draftId, received],
  );
  const remote: RemoteAwareness = peers[0] ?? idleAwarenessState;
  // Extracted so the expiry effects below have statically checkable
  // dependencies: the peer array is rebuilt on every packet, and keying the
  // countdowns on it directly would restart every teacher's timer whenever
  // any one of them moved.
  const pointerExpiryKey = peerPointerKey(peers);
  const cursorExpiryKey = peerCursorKey(peers);

  /**
   * @param reliable Movement is volatile: the next event supersedes this one
   *   within eighty milliseconds, so a dropped frame costs nothing. A clear is
   *   not superseded by anything, so it is sent on the ordinary channel and
   *   buffered across a reconnection. That also clears markers immediately on
   *   teardown instead of waiting for their idle policy.
   */
  const send = React.useCallback(
    (reliable = false) => {
      const currentDraft = draftRef.current;
      if (!socket || !currentDraft) return;
      const channel = reliable ? socket : socket.volatile;
      channel.emit(monitoringClientEvents.awarenessUpdate, {
        draftId: currentDraft,
        sequence: nextAwarenessSequence(socket),
        cursor: cursorRef.current,
        pointer: pointerRef.current?.code ? null : pointerRef.current,
        editorPointer: pointerRef.current?.code ? pointerRef.current : null,
        ...(identityRef.current ? { identity: identityRef.current } : {}),
      });
    },
    [socket],
  );

  /* ------------------------------------------------------------- outgoing */

  const publishCursor = React.useCallback(
    (cursor: CollaborationCursor | null) => {
      cursorRef.current = cursor;
      const now = Date.now();
      const elapsed = now - lastCursorAt.current;
      const remaining = monitoringTiming.cursorIntervalMs - elapsed;
      if (remaining <= 0) {
        cancelCursorFlush();
        lastCursorAt.current = now;
        // The first event after the peer could have expired this marker must
        // not be dropped as volatile, or activity would fail to restore it.
        send(elapsed >= monitoringTiming.pointerExpiryMs);
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
      const elapsed = now - lastPointerAt.current;
      const remaining = monitoringTiming.pointerIntervalMs - elapsed;
      if (remaining <= 0) {
        cancelPointerFlush();
        lastPointerAt.current = now;
        // Reliably wake an idle marker; subsequent high-frequency samples stay
        // volatile and bounded by the normal pointer interval.
        send(elapsed >= monitoringTiming.pointerExpiryMs);
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
    if (!socket) return;
    const restoreAfterReconnect = () => {
      // The gateway clears awareness as soon as a transport ends. Socket.IO
      // may recover the room moments later, so reassert the last meaningful
      // state instead of leaving the peer with a false absence until the local
      // person happens to move again.
      if (draftRef.current) send(true);
    };
    socket.on('connect', restoreAfterReconnect);
    return () => {
      socket.off('connect', restoreAfterReconnect);
    };
  }, [send, socket]);

  React.useEffect(() => {
    if (!socket || !draftId || typeof document === 'undefined') return;

    const publishPoint = (
      point: PointerViewportPoint,
      resolved: PointerCaptureSurface | null,
      /** The element under the pointer, when the event has one. */
      target: EventTarget | null = null,
    ) => {
      if (!resolved) {
        // There is no shared coordinate for browser chrome, a modal, or a gap
        // between panes. Keep the last representable position: the receiver's
        // lifecycle decides whether it fades or remains until session end.
        return;
      }
      if (resolved.surface === 'editor') {
        publishPointer(captureCodePointer(resolved.element, point, draftId));
        return;
      }
      // The canvas when the point is inside one, the pane otherwise. A canvas
      // box is the same box on both screens; a pane box is not, and the space
      // travels with the position so a receiver in the other mode names the
      // region instead of drawing somewhere plausible and wrong.
      if (resolved.canvas && !canvasLayoutReady(resolved.canvas)) {
        publishPointer(null);
        return;
      }
      const { box, material, space } = pointerBoxFor(resolved);
      const position =
        space === 'canvas'
          ? toCanvasPosition(point, box)
          : toSurfaceFraction(point, box);
      if (!position) return;
      // In pane space, the row or line under the pointer travels with the pane
      // fraction. The fraction alone lands on different content when the two
      // panes are different heights; the anchor lands on the same content.
      const anchor =
        space === 'surface'
          ? resolvePointerAnchor(target, resolved.element, point)
          : null;
      publishPointer({
        surface: resolved.surface,
        space,
        material,
        ...position,
        ...(anchor ? { anchor } : {}),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      publishPoint(event, resolvePointerSurface(event.target), event.target);
    };

    // Capture phase: Monaco and the terminal stop propagation of their own
    // pointer handling, and a listener on the bubble phase would go silent
    // over exactly the two panes that matter most.
    document.addEventListener('pointermove', onPointerMove, true);
    const stopObservingFrames = observeSurfaceIframes({
      // Crossing out of a shared frame has no useful destination coordinate.
      // The parent listener publishes again if another shared surface is hit.
      onLeave: () => undefined,
      onPointerMove: publishPoint,
    });
    return () => {
      stopObservingFrames();
      document.removeEventListener('pointermove', onPointerMove, true);
    };
  }, [draftId, publishPointer, socket]);

  React.useEffect(() => {
    if (!socket || !draftId) return;
    return () => {
      // This cleanup represents leaving a document, not pointer inactivity.
      // Clear both fields together and reliably so a held student marker can
      // never survive navigation, draft replacement, or hook teardown.
      pointerRef.current = null;
      cursorRef.current = null;
      socket.emit(monitoringClientEvents.awarenessUpdate, {
        draftId,
        sequence: nextAwarenessSequence(socket),
        cursor: null,
        pointer: null,
        ...(identityRef.current ? { identity: identityRef.current } : {}),
      });
    };
  }, [draftId, socket]);

  /* ------------------------------------------------------------- incoming */

  React.useEffect(() => {
    if (!socket) return;
    const onAwareness = (event: AwarenessChangedEvent) => {
      if (event.origin !== peerOrigin || event.draftId !== draftId) return;
      if (event.editorPointer?.code && event.editorPointer.code.draftId !== event.draftId) return;
      setReceived((current) =>
        receivePeerAwareness(
          current,
          {
            ...event,
            pointer:
              event.editorPointer ??
              (event.pointer?.surface === 'editor' ? null : event.pointer),
          },
          Date.now(),
        ),
      );
    };
    socket.on(monitoringServerEvents.awarenessChanged, onAwareness);
    return () => {
      socket.off(monitoringServerEvents.awarenessChanged, onAwareness);
    };
  }, [draftId, peerOrigin, socket]);

  /**
   * A pointer that stopped arriving disappears — where the caller asked for it.
   *
   * When it does expire, the peer may have moved off a surface during a
   * dropped frame, switched tabs, or lost the connection, and in every one of
   * those cases an arrow left hovering over the code is claiming something
   * that is no longer true. When it does not, the position is held until
   * collaboration teardown or the gateway speaking for a connection that can
   * no longer speak for itself.
   *
   * Cursor expiry is scheduled independently below. Mouse traffic must never
   * prolong a caret, and cursor traffic must never prolong an arrow.
   */
  // Measured from what is on screen, not from what arrived: awareness for a
  // document this hook has already left is never counted down, and never
  // reaches back into state to remove something it does not own.
  //
  // One timer per peer per marker. A single pair of timers over a merged
  // position would let the most recently active teacher keep four idle
  // teachers' arrows alive, and let one going idle remove all five.
  React.useEffect(() => {
    const disarms = peers
      .map((peer) =>
        scheduleRemoteAwarenessExpiry(remotePointer, peer.pointer, () =>
          setReceived((current) =>
            expirePeerMarker(current, peer.peerId, 'pointer'),
          ),
        ),
      )
      .filter((disarm): disarm is () => void => disarm !== undefined);
    return () => disarms.forEach((disarm) => disarm());
    // Keyed on each peer's own pointer and its own activity stamp, so one
    // peer's movement never restarts another's countdown.
  }, [pointerExpiryKey, peers, remotePointer]);

  React.useEffect(() => {
    const disarms = peers
      .map((peer) =>
        scheduleRemoteAwarenessExpiry(remoteCursor, peer.cursor, () =>
          setReceived((current) =>
            expirePeerMarker(current, peer.peerId, 'cursor'),
          ),
        ),
      )
      .filter((disarm): disarm is () => void => disarm !== undefined);
    return () => disarms.forEach((disarm) => disarm());
  }, [cursorExpiryKey, peers, remoteCursor]);

  return { remote, peers, publishCursor };
}
