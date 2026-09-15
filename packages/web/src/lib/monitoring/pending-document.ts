import * as Y from 'yjs';

/** A replay must extend the same CRDT history, not a rebuilt plain snapshot. */
export function canReplayPendingDocument(base: Uint8Array, server: Uint8Array): boolean {
  try {
    const available = Y.decodeStateVector(server);
    return [...Y.decodeStateVector(base)].every(([client, clock]) =>
      (available.get(client) ?? 0) >= clock);
  } catch {
    return false;
  }
}
