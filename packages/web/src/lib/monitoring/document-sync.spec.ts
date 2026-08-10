import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { applyDocumentSyncResult } from './document-sync';

const draftId = '44444444-4444-4444-8444-444444444444';

function syncResult(code = 'print(1)') {
  const source = new Y.Doc();
  source.getText('code').insert(0, code);
  return {
    draftId,
    update: Y.encodeStateAsUpdate(source),
    stateVector: Y.encodeStateVector(source),
  };
}

describe('applyDocumentSyncResult', () => {
  it('applies the matching authoritative draft as a server update', () => {
    const doc = new Y.Doc();
    const updates = vi.fn();
    doc.on('update', updates);

    expect(
      applyDocumentSyncResult({ currentDraftId: draftId, doc, result: syncResult() }),
    ).toBe(true);
    expect(doc.getText('code').toString()).toBe('print(1)');
    expect(updates).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'server',
      doc,
      expect.anything(),
    );
  });

  it('ignores stale and malformed results', () => {
    const doc = new Y.Doc();
    expect(
      applyDocumentSyncResult({
        currentDraftId: '55555555-5555-4555-8555-555555555555',
        doc,
        result: syncResult(),
      }),
    ).toBe(false);
    expect(
      applyDocumentSyncResult({ currentDraftId: draftId, doc, result: {} }),
    ).toBe(false);
    expect(doc.getText('code').toString()).toBe('');
  });

  it('is safe when acknowledgement and event deliver the same update', () => {
    const doc = new Y.Doc();
    const result = syncResult('print(2)');
    expect(applyDocumentSyncResult({ currentDraftId: draftId, doc, result })).toBe(
      true,
    );
    expect(applyDocumentSyncResult({ currentDraftId: draftId, doc, result })).toBe(
      true,
    );
    expect(doc.getText('code').toString()).toBe('print(2)');
  });
});
