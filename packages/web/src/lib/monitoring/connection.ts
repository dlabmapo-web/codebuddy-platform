import { monitoringNamespace } from '@cove/shared';

/**
 * Pure connection vocabulary for the monitoring surfaces.
 *
 * The states are deliberately distinct rather than a single boolean: an
 * ordinary offline student and an unreachable realtime service look identical
 * to a boolean, and reporting the second as the first is exactly the failure
 * this design set out to remove.
 */

export type MonitoringConnectionState =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'resynchronizing'
  | 'degraded'
  | 'revoked';

/**
 * The Socket.IO origin, derived from the configured RPC endpoint.
 *
 * The namespace is a path on the same origin, so a deployment that moves the
 * API needs no second variable to keep in step with the first.
 */
export function monitoringSocketUrl(apiUrl: string): string {
  const origin = new URL(apiUrl).origin;
  return `${origin}${monitoringNamespace}`;
}

export type ConnectionEvent =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'recovered' }
  | { type: 'recovery_failed' }
  | { type: 'synchronized' }
  | { type: 'degraded' }
  | { type: 'revoked' };

/**
 * How one connection signal changes what the user is told.
 *
 * Revocation is terminal: once access is gone, a later reconnect must not
 * quietly put the teacher back into a class they no longer run. Degradation is
 * not terminal — the service can come back — but it never reads as `live`
 * until the client has actually resynchronized.
 */
export function nextConnectionState(
  current: MonitoringConnectionState,
  event: ConnectionEvent,
): MonitoringConnectionState {
  if (current === 'revoked') return 'revoked';
  switch (event.type) {
    case 'revoked':
      return 'revoked';
    case 'degraded':
      return 'degraded';
    case 'connect':
      // Connected is not yet live: the snapshot and document sync that follow
      // are what make the surface trustworthy.
      return current === 'live' ? 'live' : 'resynchronizing';
    case 'disconnect':
      return 'reconnecting';
    case 'recovered':
      return 'live';
    case 'recovery_failed':
      return 'resynchronizing';
    case 'synchronized':
      return 'live';
  }
}

/** Live actions stay disabled until the server has confirmed the session. */
export function canActLive(state: MonitoringConnectionState): boolean {
  return state === 'live';
}

/**
 * A live transport is not sufficient after Follow swaps the collaborative
 * document. Mutations stay locked until the authoritative snapshot for the
 * exact newly-authorized draft has been applied.
 */
export function canEditSynchronizedDraft({
  state,
  sessionDraftId,
  syncedDraftId,
  ended,
}: {
  state: MonitoringConnectionState;
  sessionDraftId: string | null;
  syncedDraftId: string | null;
  ended: boolean;
}): boolean {
  return (
    canActLive(state) &&
    sessionDraftId !== null &&
    syncedDraftId === sessionDraftId &&
    !ended
  );
}
