import { describe, expect, it } from 'vitest';
import { awarenessUpdatePayloadSchema } from './events.js';

const draftId = '10000000-0000-4000-8000-000000000001';
const editorPointer = {
  surface: 'editor', space: 'surface', material: 'problem', x: 0, y: 0,
  code: { kind: 'yjs', draftId, line: 1, column: 3, relative: [0, 1, 2] },
};
const packet = { draftId, sequence: 1, cursor: null, pointer: null, editorPointer };

describe('code awareness extension', () => {
  it('carries code anchors separately, leaving the legacy arrow empty', () => {
    expect(awarenessUpdatePayloadSchema.parse(packet).editorPointer).toEqual(editorPointer);
    const legacy = awarenessUpdatePayloadSchema.omit({ editorPointer: true }).parse(packet);
    expect(legacy.pointer).toBeNull();
    expect(legacy).not.toHaveProperty('editorPointer');
  });
  it('preserves mouse offsets through wire validation', () => {
    const withOffset = { ...editorPointer, code: { ...editorPointer.code, offset: { x: 5.25, y: -0.2 } } };
    expect(awarenessUpdatePayloadSchema.parse({ ...packet, editorPointer: withOffset }).editorPointer)
      .toEqual(withOffset);
  });
  it('rejects anchors in the legacy channel and invalid or oversized payloads', () => {
    expect(awarenessUpdatePayloadSchema.safeParse({ ...packet, pointer: editorPointer }).success).toBe(false);
    for (const code of [
      { ...editorPointer.code, relative: Array(257).fill(0) },
      { ...editorPointer.code, relative: [-1] },
      { ...editorPointer.code, line: 0 },
      { ...editorPointer.code, offset: { x: Infinity, y: 0 } },
      { ...editorPointer.code, offset: { x: 0, y: 100_001 } },
      { ...editorPointer.code, kind: 'pixels' },
    ]) {
      expect(awarenessUpdatePayloadSchema.safeParse({ ...packet, editorPointer: { ...editorPointer, code } }).success).toBe(false);
    }
  });
});
