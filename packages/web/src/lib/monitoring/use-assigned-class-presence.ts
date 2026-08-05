'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  type PresenceDelta,
  type PresenceSnapshot,
} from '@cove/shared';
import * as React from 'react';

import { monitoringAck } from './types';
import { useMonitoringSocket } from './use-monitoring-socket';

/**
 * Live counts for the teacher's own class list.
 *
 * The list joins every class it shows, which is bounded by how many classes
 * one teacher runs. Counts come from the room's own snapshot, so the card and
 * the class page can never disagree about how many students are online.
 */
export type ClassPresenceCounts = { online: number; solving: number };

export function useAssignedClassPresence({
  academyId,
  classIds,
}: {
  academyId: string;
  classIds: readonly string[];
}) {
  const { socket, state, report } = useMonitoringSocket();
  const [counts, setCounts] = React.useState<
    Record<string, ClassPresenceCounts>
  >({});
  // Joined by value, not by identity: a re-render that rebuilds the array must
  // not rejoin every room.
  const key = classIds.join(',');

  React.useEffect(() => {
    if (!socket) return;
    const ids = key.length > 0 ? key.split(',') : [];

    const joinAll = () => {
      for (const classId of ids) {
        socket.emit(
          monitoringClientEvents.classJoin,
          { eventId: crypto.randomUUID(), academyId, classId },
          monitoringAck<{ joined: true }>((ack) => {
            if (ack?.ok) {
              report({ type: 'synchronized' });
            } else if (ack?.code === 'MONITORING_REALTIME_UNAVAILABLE') {
              report({ type: 'degraded' });
            }
          }),
        );
      }
    };

    const onSnapshot = (snapshot: PresenceSnapshot) => {
      setCounts((current) => ({
        ...current,
        [snapshot.classId]: {
          online: snapshot.onlineCount,
          solving: snapshot.solvingCount,
        },
      }));
    };

    const onDelta = (delta: PresenceDelta) => {
      setCounts((current) => ({
        ...current,
        [delta.classId]: {
          online: delta.onlineCount,
          solving: delta.solvingCount,
        },
      }));
    };

    socket.on(monitoringServerEvents.classSnapshot, onSnapshot);
    socket.on(monitoringServerEvents.presenceChanged, onDelta);
    socket.on('connect', joinAll);
    if (socket.connected) joinAll();

    return () => {
      socket.off(monitoringServerEvents.classSnapshot, onSnapshot);
      socket.off(monitoringServerEvents.presenceChanged, onDelta);
      socket.off('connect', joinAll);
      for (const classId of ids) {
        socket.emit(monitoringClientEvents.classLeave, {
          eventId: crypto.randomUUID(),
          academyId,
          classId,
        });
      }
    };
  }, [academyId, key, report, socket]);

  return { counts, state };
}
