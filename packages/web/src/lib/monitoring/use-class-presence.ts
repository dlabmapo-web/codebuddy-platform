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
  const [entries, setEntries] = React.useState<PresenceEntry[]>([]);
  const [version, setVersion] = React.useState(0);
  const [denied, setDenied] = React.useState<string | null>(null);
  const versionRef = React.useRef(0);

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
      setEntries(snapshot.entries);
      setVersion(snapshot.version);
      versionRef.current = snapshot.version;
      report({ type: 'synchronized' });
    };

    const onDelta = (delta: PresenceDelta) => {
      if (delta.classId !== classId) return;
      setEntries((current) => {
        const result = applyPresenceDelta(
          { version: versionRef.current, entries: current },
          delta,
        );
        if (result.outcome === 'stale') return current;
        if (result.outcome === 'gap') {
          // One refresh, then back to deltas.
          requestSnapshot(socket);
          return current;
        }
        versionRef.current = result.version;
        setVersion(result.version);
        return result.entries;
      });
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

  return { entries, version, state, denied, socket };
}
