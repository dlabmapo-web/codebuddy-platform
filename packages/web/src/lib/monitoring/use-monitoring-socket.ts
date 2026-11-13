'use client';

import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { ClassTransportContext } from './class-monitoring-context';
import type { MonitoringChannel } from './class-transport-pool';
import { createMonitoringSocket } from './socket';
import {
  nextConnectionState,
  monitoringRevocationApplies,
  type ConnectionEvent,
  type MonitoringConnectionState,
} from './connection';

/** Local state per watch; transports belong to the mounted class layout when available. */
export function useMonitoringSocket(scope?: { classId: string; studentMembershipId?: string }, options?: { enabled?: boolean; channel?: MonitoringChannel }): {
  socket: Socket | null;
  state: MonitoringConnectionState;
  /** Lets a page report its own synchronization progress. */
  report: (event: ConnectionEvent) => void;
} {
  const shared = React.useContext(ClassTransportContext);
  const sharing = Boolean(shared && scope && shared.classId === scope.classId);
  const pool = sharing ? shared!.pool : undefined;
  const enabled = options?.enabled !== false && (!sharing || pool !== null);
  const channel = options?.channel ?? (scope?.studentMembershipId ? 'workspace' : 'class');
  const scopeRef = React.useRef(scope);
  React.useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [state, setState] = React.useState<MonitoringConnectionState>(
    'connecting',
  );

  const report = React.useCallback((event: ConnectionEvent) => {
    setState((current) => nextConnectionState(current, event));
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    let created: Socket | null = null;
    let networkListeners:
      | { onOffline: () => void; onOnline: () => void }
      | undefined;

    let detach: (() => void) | undefined;
    void (pool ? pool.get(channel) : createMonitoringSocket()).then((instance) => {
      if (!active) {
        if (!pool) instance.close();
        return;
      }
      created = instance;
      setSocket(instance);

      const onConnect = () => report({ type: instance.recovered ? 'recovered' : 'connect' });
      const onDisconnect = () => report({ type: 'disconnect' });
      const onDegraded = (payload: { degraded: boolean }) => { if (payload.degraded) report({ type: 'degraded' }); };
      const onRevoked = (event: { classId?: string; studentMembershipId?: string | null }) => {
        if (monitoringRevocationApplies(scopeRef.current, event)) report({ type: 'revoked' });
      };
      instance.on('connect', onConnect);
      instance.on('disconnect', onDisconnect);
      instance.on('connect_error', onDisconnect);
      instance.on('server.degraded', onDegraded);
      instance.on('access.revoked', onRevoked);
      // A reused transport may already be connected; the watch still needs its own snapshot.
      if (instance.connected) onConnect();
      detach = () => {
        instance.off('connect', onConnect);
        instance.off('disconnect', onDisconnect);
        instance.off('connect_error', onDisconnect);
        instance.off('server.degraded', onDegraded);
        instance.off('access.revoked', onRevoked);
      };

      // Browsers can enter offline mode without immediately closing an
      // established WebSocket. Reflect the browser's network signal instead
      // of continuing to claim the workspace is live, then either reuse the
      // still-connected transport or ask Socket.IO to reconnect on return.
      const onOffline = () => report({ type: 'disconnect' });
      const onOnline = () => {
        if (instance.connected) {
          report({ type: 'recovered' });
        } else {
          instance.connect();
        }
      };
      globalThis.addEventListener('offline', onOffline);
      globalThis.addEventListener('online', onOnline);
      networkListeners = { onOffline, onOnline };
    }).catch(() => { if (active) report({ type: 'degraded' }); });

    return () => {
      active = false;
      if (networkListeners) {
        globalThis.removeEventListener('offline', networkListeners.onOffline);
        globalThis.removeEventListener('online', networkListeners.onOnline);
      }
      detach?.();
      if (!pool) { created?.removeAllListeners(); created?.close(); }
    };
  }, [report, pool, channel, enabled]);

  return { socket, state, report };
}
