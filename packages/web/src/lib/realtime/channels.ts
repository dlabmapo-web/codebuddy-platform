import { supabaseBrowser } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const PRESENCE_CHANNEL = 'presence:online';

export function sessionChannel(sessionId: string) {
  return `session:${sessionId}`;
}

export interface PresenceUser {
  id: string;
  name: string;
  role: string;
}

// TODO (production): replace public channel mode with Supabase-JWT-signed token-based channel auth

export function joinPresence(user: PresenceUser): RealtimeChannel {
  const client = supabaseBrowser();
  const channel = client.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: user.id } },
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name: user.name, role: user.role });
    }
  });

  return channel;
}

export interface SessionUser extends PresenceUser {
  cursor?: { line: number; column: number };
}

export function joinSession(sessionId: string, user: SessionUser): RealtimeChannel {
  const client = supabaseBrowser();
  const channel = client.channel(sessionChannel(sessionId), {
    config: {
      broadcast: { self: false },
      presence: { key: user.id },
    },
  });

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name: user.name, role: user.role });
    }
  });

  return channel;
}

export type CodeUpdatePayload = { code: string; userId: string };
export type CursorMovePayload = { userId: string; line: number; column: number };

export function broadcastCodeUpdate(channel: RealtimeChannel, payload: CodeUpdatePayload) {
  channel.send({ type: 'broadcast', event: 'code:update', payload });
}

export function broadcastCursorMove(channel: RealtimeChannel, payload: CursorMovePayload) {
  channel.send({ type: 'broadcast', event: 'cursor:move', payload });
}
