import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { canReplayPendingDocument } from './pending-document';

describe('retained teacher document history', () => {
  it('accepts concurrent edits and deletions on the original history', () => {
    const original = new Y.Doc();
    original.getText('code').insert(0, 'original');
    const base = Y.encodeStateVector(original);
    const server = new Y.Doc();
    Y.applyUpdate(server, Y.encodeStateAsUpdate(original));
    server.getText('code').delete(0, 3);
    server.getText('code').insert(0, 'student');
    expect(canReplayPendingDocument(base, Y.encodeStateVector(server))).toBe(true);
    original.destroy(); server.destroy();
  });
  it('refuses identical plain text rebuilt under another history', () => {
    const original = new Y.Doc();
    const rebuilt = new Y.Doc();
    original.getText('code').insert(0, 'same text');
    rebuilt.getText('code').insert(0, 'same text');
    expect(canReplayPendingDocument(Y.encodeStateVector(original), Y.encodeStateVector(rebuilt))).toBe(false);
    original.destroy(); rebuilt.destroy();
  });
  it('fails closed on malformed vectors', () => {
    expect(canReplayPendingDocument(new Uint8Array([255]), new Uint8Array([0]))).toBe(false);
  });
});
