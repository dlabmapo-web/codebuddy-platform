'use client';

import {
  applyPresenceDelta,
  monitoringClientEvents,
  monitoringServerEvents,
  type PresenceDelta,
  type PresenceEntry,
  type PresenceSnapshot,
} from '@cove/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { nextPresenceDeadline } from './presence-deadline';
import { monitoringAck } from './types';
import { useMonitoringSocket } from './use-monitoring-socket';

/**
 * The live half of one class roster.
 *
 * The durable half comes from the oRPC query and is merged by the page; this
 * hook only ever reports presence. A version gap asks for exactly one fresh
 * snapshot — never a polling loop, which is what made v1's roster expensive
 * and still wrong.
 */
export function useClassPresence({
  academyId,
  classId,
}: {
  academyId: string;
  classId: string;
}) {
  const { socket, state, report } = useMonitoringSocket();
  const [presence, setPresence] = React.useState<{
    entries: PresenceEntry[];
    version: number;
  }>({ entries: [], version: 0 });
  const [denied, setDenied] = React.useState<string | null>(null);
  // Socket events arrive outside React. Advance their canonical value
  // synchronously before scheduling a render so two deltas in one render
  // window are still compared against one another, not against stale state.
  const presenceRef = React.useRef(presence);

  const requestSnapshot = React.useCallback(
    (instance: Socket) => {
      instance.emit(
        monitoringClientEvents.classJoin,
        { eventId: crypto.randomUUID(), academyId, classId },
        monitoringAck<{ joined: true }>((ack) => {
          if (ack?.ok) {
            report({ type: 'synchronized' });
            setDenied(null);
            return;
          }
          // A denial is a state, not an error banner: the class may have been
          // reassigned while the page was open.
          setDenied(ack?.code ?? 'MONITORING_REALTIME_UNAVAILABLE');
          report({ type: ack?.code === 'MONITORING_ACCESS_DENIED' ? 'revoked' : 'degraded' });
        }),
      );
    },
    [academyId, classId, report],
  );

  React.useEffect(() => {
    if (!socket) return;

    const onSnapshot = (snapshot: PresenceSnapshot) => {
      if (snapshot.classId !== classId) return;
      const next = { entries: snapshot.entries, version: snapshot.version };
      presenceRef.current = next;
      setPresence(next);
      report({ type: 'synchronized' });
    };

    const onDelta = (delta: PresenceDelta) => {
      if (delta.classId !== classId) return;
      const result = applyPresenceDelta(presenceRef.current, delta);
      if (result.outcome === 'stale') return;
      if (result.outcome === 'gap') {
        // One authoritative refresh, then back to deltas. The old state stays
        // visible until that snapshot arrives; no partial delta is guessed.
        requestSnapshot(socket);
        return;
      }
      const next = { entries: result.entries, version: result.version };
      presenceRef.current = next;
      setPresence(next);
    };

    // Named, so the cleanup can actually remove it: an inline arrow here
    // accumulates a listener per mount and rejoins the room N times.
    const onConnect = () => requestSnapshot(socket);

    socket.on(monitoringServerEvents.classSnapshot, onSnapshot);
    socket.on(monitoringServerEvents.presenceChanged, onDelta);
    socket.on('connect', onConnect);
    if (socket.connected) requestSnapshot(socket);

    return () => {
      socket.off(monitoringServerEvents.classSnapshot, onSnapshot);
      socket.off(monitoringServerEvents.presenceChanged, onDelta);
      socket.off('connect', onConnect);
      socket.emit(monitoringClientEvents.classLeave, {
        eventId: crypto.randomUUID(),
        academyId,
        classId,
      });
    };
  }, [academyId, classId, report, requestSnapshot, socket]);

  React.useEffect(() => {
    if (!socket) return;
    const deadline = nextPresenceDeadline(presence.entries);
    if (deadline === null) return;
    // One deadline-driven authoritative read converts RECONNECTING to OFFLINE
    // after the grace period. The small margin absorbs clock and timer jitter
    // so a snapshot cannot arrive just before the server's boundary.
    const timer = setTimeout(
      () => requestSnapshot(socket),
      Math.max(0, deadline - Date.now()) + 100,
    );
    return () => clearTimeout(timer);
  }, [presence.entries, requestSnapshot, socket]);

  return {
    entries: presence.entries,
    version: presence.version,
    state,
    denied,
    socket,
  };
}
