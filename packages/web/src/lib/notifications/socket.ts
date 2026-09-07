'use client';

import { io, type Socket } from 'socket.io-client';
import { notificationsNamespace } from '@cove/shared';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

/**
 * The Socket.IO origin for the notification namespace.
 *
 * Derived from the configured RPC endpoint, exactly as the monitoring one is,
 * so moving the API needs no second variable to keep in step with the first.
 */
export function notificationSocketUrl(apiUrl: string): string {
  return `${new URL(apiUrl).origin}${notificationsNamespace}`;
}

/**
 * One authenticated notification connection for the whole session.
 *
 * The access token travels in the handshake and is re-read on every
 * reconnection attempt, so a token that rotated while a laptop was closed does
 * not become a permanently failing socket. The server verifies it on every
 * connect and puts the socket in one room named after the account it just
 * verified; this side never names a room and never sends an event.
 */
export function createNotificationSocket(): Socket {
  return io(notificationSocketUrl(publicConfig.apiUrl), {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    withCredentials: true,
    auth: (callback: (data: { token: string | null }) => void) => {
      void createClient()
        .auth.getSession()
        .then(({ data }) =>
          callback({ token: data.session?.access_token ?? null }),
        );
    },
  });
}
