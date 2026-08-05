'use client';

import { io, type Socket } from 'socket.io-client';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

import { monitoringSocketUrl } from './connection';

/**
 * One authenticated monitoring connection.
 *
 * The access token travels in the handshake and is re-read on every
 * reconnection attempt, so a token that rotated while the laptop was closed
 * does not turn into a permanently failing socket. The server verifies it on
 * every connect — including after connection-state recovery — so nothing here
 * is trusted to have stayed true.
 */
export async function createMonitoringSocket(): Promise<Socket> {
  const socket = io(monitoringSocketUrl(publicConfig.apiUrl), {
    // WebSocket preferred, polling retained: the transport question is settled
    // by the deployment's load balancer, not by the browser.
    transports: ['websocket', 'polling'],
    autoConnect: false,
    withCredentials: true,
    // Do not enable Socket.IO's global acknowledged retries here. This socket
    // also carries intentionally unacknowledged presence and awareness events;
    // global retries serialize the queue behind those events. Reliable
    // transport preserves connected delivery, while reconnect performs a
    // fresh CRDT sync and command event IDs keep explicit retries idempotent.
    auth: (callback: (data: { token: string | null }) => void) => {
      void createClient()
        .auth.getSession()
        .then(({ data }) =>
          callback({ token: data.session?.access_token ?? null }),
        );
    },
  });
  socket.connect();
  return socket;
}
