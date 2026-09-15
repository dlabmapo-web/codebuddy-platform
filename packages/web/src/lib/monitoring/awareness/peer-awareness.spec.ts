import { describe, expect, it } from 'vitest';
import type { AwarenessChangedEvent } from '@cove/shared';

import {
  expirePeerMarker,
  noPeers,
  peersOn,
  receivePeerAwareness,
  retainDraft,
  type PeerAwarenessMap,
} from './peer-awareness';

const draftId = 'a0000000-0000-4000-8000-000000000001';

/** A caret with no selection, which is what a plain click produces. */
function caret(line: number, column: number) {
  return {
    line,
    column,
    selectionEndLine: null,
    selectionEndColumn: null,
  };
}
const otherDraftId = 'a0000000-0000-4000-8000-000000000002';

function packet(
  overrides: Partial<AwarenessChangedEvent> = {},
): AwarenessChangedEvent {
  return {
    draftId,
    sequence: 1,
    cursor: caret(1, 1),
    pointer: null,
    origin: 'TEACHER',
    peerId: 'teacher:visit-1',
    generation: 1,
    ...overrides,
  } as AwarenessChangedEvent;
}

/** A server-authored lifecycle clear: no sequence, both markers null. */
function departure(peerId: string, generation = 1): AwarenessChangedEvent {
  return {
    draftId,
    cursor: null,
    pointer: null,
    origin: 'TEACHER',
    peerId,
    generation,
  } as AwarenessChangedEvent;
}

function receive(
  peers: PeerAwarenessMap,
  event: AwarenessChangedEvent,
  at = 1_000,
): PeerAwarenessMap {
  return receivePeerAwareness(peers, event, at);
}

describe('several peers at once', () => {
  it('keeps two teachers as two independent peers', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(
      peers,
      packet({ peerId: 'teacher:visit-2', cursor: caret(9, 4) }),
    );

    expect(peersOn(peers, draftId)).toHaveLength(2);
  });

  /**
   * The failure the single-slot model produced: two tabs sharing one
   * `TEACHER` slot overwrote each other's caret on every packet, so the
   * student saw one arrow flickering between two positions.
   */
  it('does not let one teacher overwrite another teacher', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(
      peers,
      packet({ peerId: 'teacher:visit-2', cursor: caret(9, 4) }),
    );

    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(1, 1));
    expect(peers['teacher:visit-2']?.cursor).toEqual(caret(9, 4));
  });

  it('removes only the peer that left', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(peers, packet({ peerId: 'teacher:visit-2' }));

    peers = receive(peers, departure('teacher:visit-1'));

    expect(peers['teacher:visit-1']?.departed).toBe(true);
    expect(peers['teacher:visit-2']?.cursor).not.toBeNull();
  });

  it('keeps a departure fence without rendering a marker', () => {
    let peers = receive(noPeers, packet());
    peers = receive(peers, departure('teacher:visit-1'));
    expect(peersOn(peers, draftId)).toEqual([]);
  });

  it('expires one peer marker without touching the others', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(peers, packet({ peerId: 'teacher:visit-2' }));

    peers = expirePeerMarker(peers, 'teacher:visit-1', 'cursor');

    expect(peers['teacher:visit-1']?.cursor).toBeNull();
    expect(peers['teacher:visit-2']?.cursor).not.toBeNull();
  });

  it('orders peers stably, so rendering does not reshuffle', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-2' }));
    peers = receive(peers, packet({ peerId: 'teacher:visit-1' }));
    expect(peersOn(peers, draftId).map((peer) => peer.peerId)).toEqual([
      'teacher:visit-1',
      'teacher:visit-2',
    ]);
  });
});

describe('generation fencing', () => {
  /**
   * A clear delayed behind a reconnect arrives after the session that replaced
   * it has already published. Applying it would erase a live marker.
   */
  it('ignores a stale clear from a superseded generation', () => {
    let peers = receive(
      noPeers,
      packet({ peerId: 'teacher:visit-1', generation: 2 }),
    );
    peers = receive(peers, departure('teacher:visit-1', 1));

    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(1, 1));
  });

  it('ignores a stale position from a superseded generation', () => {
    let peers = receive(
      noPeers,
      packet({ generation: 2, cursor: caret(9, 4) }),
    );
    peers = receive(
      peers,
      packet({ generation: 1, cursor: caret(1, 1) }),
    );

    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(9, 4));
  });

  it('accepts the same generation, which is ordinary movement', () => {
    let peers = receive(noPeers, packet({ cursor: caret(1, 1) }));
    peers = receive(peers, packet({ cursor: caret(2, 1) }));
    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(2, 1));
  });

  it('accepts a newer generation, which is the reconnect', () => {
    let peers = receive(noPeers, packet({ generation: 1 }));
    peers = receive(
      peers,
      packet({ generation: 2, cursor: caret(5, 2) }),
    );
    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(5, 2));
  });
});

describe('documents', () => {
  /**
   * One hook tracks one document, so a packet naming another draft is not a
   * second document to hold alongside the first — it means this client has
   * followed the student somewhere else, and the previous exercise's arrows
   * would be fractions of a pane that is no longer on screen.
   */
  it('drops the previous document\'s peers when a new draft arrives', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(
      peers,
      packet({ peerId: 'teacher:visit-2', draftId: otherDraftId }),
    );

    expect(peersOn(peers, draftId)).toEqual([]);
    expect(peersOn(peers, otherDraftId).map((peer) => peer.peerId)).toEqual([
      'teacher:visit-2',
    ]);
  });

  it('keeps peers that share the current draft', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }));
    peers = receive(peers, packet({ peerId: 'teacher:visit-2' }));

    expect(peersOn(peers, draftId).map((peer) => peer.peerId)).toEqual([
      'teacher:visit-1',
      'teacher:visit-2',
    ]);
  });

  it('reports nothing when there is no document', () => {
    const peers = receive(noPeers, packet());
    expect(peersOn(peers, null)).toEqual([]);
  });

  it('drops every peer of a document that has been left', () => {
    let peers = receive(noPeers, packet());
    peers = retainDraft(peers, otherDraftId);
    expect(peers).toEqual({});
  });

  it('keeps the map identical when nothing needed dropping', () => {
    const peers = receive(noPeers, packet());
    expect(retainDraft(peers, draftId)).toBe(peers);
  });
});

describe('compatibility', () => {
  /**
   * A server that predates peer identity still has to produce awareness. It
   * degrades to the old one-slot-per-origin behaviour rather than to silence.
   */
  it('attributes an unidentified packet to its origin', () => {
    const peers = receive(noPeers, packet({ peerId: undefined }));
    expect(Object.keys(peers)).toEqual(['origin:TEACHER']);
  });

  it('accepts a packet with no generation as current', () => {
    let peers = receive(noPeers, packet({ generation: 2 }));
    peers = receive(
      peers,
      packet({ generation: undefined, cursor: caret(7, 7) }),
    );
    expect(peers['teacher:visit-1']?.cursor).toEqual(caret(7, 7));
  });
});

describe('per-peer activity', () => {
  /**
   * The reducer this wraps already keeps pointer activity from prolonging a
   * caret. Made explicit here because the plural case is where it matters: one
   * teacher moving must not reset four other teachers' expiry countdowns.
   */
  it('stamps movement against the peer that moved', () => {
    let peers = receive(noPeers, packet({ peerId: 'teacher:visit-1' }), 1_000);
    peers = receive(peers, packet({ peerId: 'teacher:visit-2' }), 1_000);
    peers = receive(
      peers,
      packet({ peerId: 'teacher:visit-2', cursor: caret(3, 1) }),
      5_000,
    );

    expect(peers['teacher:visit-1']?.cursorMovedAt).toBe(1_000);
    expect(peers['teacher:visit-2']?.cursorMovedAt).toBe(5_000);
  });

  it('keeps a label a later packet omitted', () => {
    let peers = receive(noPeers, packet({ peerLabel: 'Teacher' }));
    peers = receive(peers, packet({ peerLabel: undefined }));
    expect(peers['teacher:visit-1']?.label).toBe('Teacher');
  });
});

 it('does not resurrect a departed teacher from a delayed packet', () => {
    let peers = receive(noPeers, packet());
    peers = receive(peers, departure('teacher:visit-1'));
    peers = receive(peers, packet({ sequence: 100 }));
    expect(peersOn(peers, draftId)).toEqual([]);
  });
