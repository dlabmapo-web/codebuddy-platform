'use client';
import * as React from 'react';
import { observationEvents, observationVersion, observationSnapshotSchema, observationAccessEnded, type ObservationSnapshot } from '@cove/shared';
import { useMonitoringSocket } from './use-monitoring-socket';

export function useObservationWatch(scope: { academyId: string; classId: string; membershipId: string }) {
  const { academyId, classId, membershipId } = scope;
  const { socket, state, report } = useMonitoringSocket({ classId: scope.classId, studentMembershipId: scope.membershipId });
  const [snapshot, setSnapshot] = React.useState<ObservationSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const session = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!socket) return;
    const scope = { academyId, classId, membershipId };
    session.current ??= crypto.randomUUID();
    let active = true;
    let accessEnded = false;
    let attempts = 0;
    let sequence = -1;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const accept = (data: unknown) => {
      const parsed = observationSnapshotSchema.safeParse(data);
      if (!active || accessEnded || !parsed.success || parsed.data.academyId !== scope.academyId ||
        parsed.data.classId !== scope.classId || parsed.data.membershipId !== scope.membershipId) return false;
      if (parsed.data.sequence <= sequence) return true;
      sequence = parsed.data.sequence;
      setSnapshot(parsed.data);
      return true;
    };
    const start = () => {
      if (!active || accessEnded || !socket.connected) return;
      sequence = -1;
      clearTimeout(retry);
      setError(null);
      socket.timeout(10000).emit(observationEvents.start, { ...scope, sessionId: session.current, version: observationVersion },
        (failure: Error | null, reply: { ok: boolean; code?: string; snapshot?: unknown }) => {
          if (!active) return;
          if (!failure && reply?.ok && accept(reply.snapshot)) { attempts = 0; report({ type: 'synchronized' }); }
          else {
            setError(reply?.code ?? 'MONITORING_REALTIME_UNAVAILABLE');
            const denied = observationAccessEnded(reply?.code);
            if (denied) { accessEnded = true; setSnapshot(null); }
            report({ type: denied ? 'revoked' : 'degraded' });
            if (!denied && socket.connected) retry = setTimeout(start, Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)));
          }
        });
    };
    const revoked = (event: { classId?: string; studentMembershipId?: string | null }) => {
      if (event.classId !== scope.classId || (event.studentMembershipId && event.studentMembershipId !== scope.membershipId)) return;
      accessEnded = true; clearTimeout(retry);
      setSnapshot(null); setError('MONITORING_ACCESS_DENIED'); report({ type: 'revoked' });
    };
    const resync = (event: { classId?: string; membershipId?: string }) => {
      if (event.classId !== classId || event.membershipId !== membershipId) return;
      report({ type: 'recovery_failed' }); start();
    };
    socket.on('connect', start);
    socket.on(observationEvents.snapshot, accept);
    socket.on('access.revoked', revoked);
    socket.on(observationEvents.resync, resync);
    if (socket.connected) start();
    return () => {
      active = false; clearTimeout(retry); socket.off('connect', start); socket.off(observationEvents.snapshot, accept); socket.off('access.revoked', revoked);
      socket.off(observationEvents.resync, resync);
      socket.emit(observationEvents.stop);
    };
  }, [socket, academyId, classId, membershipId, report]);
  return { snapshot, state, error };
}
