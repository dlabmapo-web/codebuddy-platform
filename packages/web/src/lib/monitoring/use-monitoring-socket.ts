'use client';

import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { createMonitoringSocket } from './socket';
import {
  nextConnectionState,
  type ConnectionEvent,
  type MonitoringConnectionState,
} from './connection';

/**
 * One monitoring socket, scoped to the component that needs it.
 *
 * Deliberately not a global singleton: the roster page and the live workspace
 * have different lifetimes, and a shared connection would keep a class room
 * joined after the teacher navigated away from it. Each page opens and closes
 * its own.
 */
export function useMonitoringSocket(): {
  socket: Socket | null;
  state: MonitoringConnectionState;
  /** Lets a page report its own synchronization progress. */
  report: (event: ConnectionEvent) => void;
} {
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [state, setState] = React.useState<MonitoringConnectionState>(
    'connecting',
  );

  const report = React.useCallback((event: ConnectionEvent) => {
    setState((current) => nextConnectionState(current, event));
  }, []);

  React.useEffect(() => {
    let active = true;
    let created: Socket | null = null;
    let networkListeners:
      | { onOffline: () => void; onOnline: () => void }
      | undefined;

    void createMonitoringSocket().then((instance) => {
      if (!active) {
        instance.close();
        return;
      }
      created = instance;
      setSocket(instance);

      instance.on('connect', () => {
        // `recovered` means the server restored the rooms and buffered
        // packets; anything else has to resynchronize before claiming to be
        // live, which is what stops a stale roster from looking current.
        report({ type: instance.recovered ? 'recovered' : 'connect' });
      });
      instance.on('disconnect', () => report({ type: 'disconnect' }));
      instance.on('connect_error', () => report({ type: 'disconnect' }));
      instance.on('server.degraded', (payload: { degraded: boolean }) => {
        if (payload.degraded) report({ type: 'degraded' });
      });
      instance.on('access.revoked', () => report({ type: 'revoked' }));

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
    });

    return () => {
      active = false;
      if (networkListeners) {
        globalThis.removeEventListener('offline', networkListeners.onOffline);
        globalThis.removeEventListener('online', networkListeners.onOnline);
      }
      created?.removeAllListeners();
      created?.close();
    };
  }, [report]);

  return { socket, state, report };
}
