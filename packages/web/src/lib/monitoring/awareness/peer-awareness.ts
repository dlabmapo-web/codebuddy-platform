import type { AwarenessChangedEvent } from '@cove/shared';

import {
  idleAwarenessState,
  receiveAwareness,
  type ReceivedAwarenessState,
} from './awareness-state';

/**
 * Several peers on one document, each with a position of their own.
 *
 * The previous model held exactly one remote state per origin: one slot for
 * `STUDENT` and one for `TEACHER`. That was right while a student could only
 * ever be watched by one teacher, and became wrong the moment five could be.
 * Two tabs sharing the `TEACHER` slot overwrote each other's caret on every
 * packet, and either one leaving cleared the slot for both — so the student
 * saw one arrow flickering between two positions, then none.
 *
 * So the unit is the peer, and the per-peer state is exactly the state the
 * single-peer reducer already produced. Everything that rule got right —
 * pointer activity not prolonging a caret, a same-value packet not counting as
 * movement, a change of draft resetting both — is reused unchanged rather than
 * reimplemented for the plural case.
 *
 * Peer identity is assigned by the server. A client that could name its own
 * peer id could overwrite another teacher's cursor, or erase it.
 */

export type PeerAwarenessState = ReceivedAwarenessState & {
  peerId: string;
  /** May be shared by a teacher's duplicate tabs; never an identity. */
  label: string | null;
  /**
   * The connection generation this position was published under.
   *
   * A clear that was delayed behind a reconnect arrives *after* the session
   * that replaced it has already published, and without this it would erase a
   * live marker. Compared rather than trusted: a lower generation is ignored.
   */
  generation: number;
  departed?: boolean;
};

export type PeerAwarenessMap = Readonly<Record<string, PeerAwarenessState>>;

export const noPeers: PeerAwarenessMap = Object.freeze({});

/**
 * Whether an event may act on what a peer currently shows.
 *
 * A packet from a superseded generation is not merely late — it describes a
 * session that no longer exists, and applying it would resurrect a position
 * nobody is at.
 */
function supersedes(
  current: PeerAwarenessState | undefined,
  event: { generation?: number },
): boolean {
  if (!current) return true;
  if (event.generation === undefined) return true;
  return event.generation >= current.generation;
}

/**
 * Whether this packet clears the peer entirely.
 *
 * A server-authored lifecycle clear carries no sequence and both fields null:
 * it says this peer has gone, which is different from a peer that moved off a
 * surface and is different again from one that simply stopped sending.
 */
function isDeparture(event: AwarenessChangedEvent): boolean {
  return (
    event.sequence === undefined &&
    event.cursor === null &&
    event.pointer === null
  );
}

/**
 * Folds one packet into the set of peers.
 *
 * A packet without a peer id comes from a server that predates peer identity;
 * it is attributed to its origin so a mixed-version deployment degrades to the
 * old one-slot behaviour rather than to no awareness at all.
 */
export function receivePeerAwareness(
  incoming: PeerAwarenessMap,
  event: AwarenessChangedEvent,
  receivedAt: number,
): PeerAwarenessMap {
  // A packet for a different document means this client has moved on, and the
  // previous document's peers are dropped rather than kept beside the new
  // ones. Done here, on arrival, rather than in an effect: pruning is part of
  // folding in a packet, and an effect that called setState to do it would
  // cascade a second render for every exercise a teacher follows through.
  const peers = retainDraft(incoming, event.draftId);
  const peerId = event.peerId ?? `origin:${event.origin}`;
  const current = peers[peerId];
  if (!supersedes(current, event)) return peers;
  if (current?.departed && (event.generation ?? 0) <= current.generation) return peers;

  if (isDeparture(event)) {
    // Retain a tombstone for this draft so delayed packets cannot resurrect it.
    return { ...peers, [peerId]: {
      ...(current ?? idleAwarenessState), draftId: event.draftId,
      peerId, label: current?.label ?? null, generation: event.generation ?? 0,
      cursor: null, pointer: null, departed: true,
    } };
  }

  const next = receiveAwareness(
    current?.generation === (event.generation ?? 0) ? current : idleAwarenessState,
    event,
    receivedAt,
  );
  return {
    ...peers,
    [peerId]: {
      ...next,
      departed: false,
      peerId,
      label: event.peerLabel ?? current?.label ?? null,
      generation: event.generation ?? current?.generation ?? 0,
    },
  };
}

/** Everything this document's peers show right now, in a stable order. */
export function peersOn(
  peers: PeerAwarenessMap,
  draftId: string | null,
): PeerAwarenessState[] {
  if (draftId === null) return [];
  return Object.values(peers)
    .filter((peer) => peer.draftId === draftId && !peer.departed)
    .sort((left, right) => left.peerId.localeCompare(right.peerId));
}

/**
 * Drops one peer's expired marker without touching the others.
 *
 * The expiry timers are per peer for the same reason the state is: one
 * teacher's arrow going idle says nothing about the other four.
 */
export function expirePeerMarker(
  peers: PeerAwarenessMap,
  peerId: string,
  marker: 'cursor' | 'pointer',
): PeerAwarenessMap {
  const current = peers[peerId];
  if (!current || current[marker] === null) return peers;
  return { ...peers, [peerId]: { ...current, [marker]: null } };
}

/**
 * Everything belonging to a document this client has left.
 *
 * Awareness coordinates are meaningful only against the document they were
 * measured on, so following a student to another exercise drops the peers of
 * the one being left rather than reinterpreting their fractions.
 */
export function retainDraft(
  peers: PeerAwarenessMap,
  draftId: string | null,
): PeerAwarenessMap {
  if (draftId === null) return noPeers;
  const retained = Object.entries(peers).filter(
    ([, peer]) => peer.draftId === draftId,
  );
  if (retained.length === Object.keys(peers).length) return peers;
  return Object.fromEntries(retained);
}
