import type { AwarenessChangedEvent } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  expireCursor,
  expirePointer,
  idleAwarenessState,
  receiveAwareness,
} from './awareness-state';

const draftId = '10000000-0000-4000-8000-000000000001';
const cursor = {
  line: 2,
  column: 5,
  selectionEndLine: null,
  selectionEndColumn: null,
};
const pointer = {
  surface: 'editor' as const,
  x: 0.4,
  y: 0.6,
  space: 'surface' as const,
  material: null,
};

const event = (
  next: Partial<AwarenessChangedEvent>,
): AwarenessChangedEvent => ({
  draftId,
  sequence: 0,
  cursor,
  pointer,
  origin: 'STUDENT',
  ...next,
});

describe('receiveAwareness', () => {
  it('tracks pointer and cursor activity independently', () => {
    const initial = receiveAwareness(idleAwarenessState, event({}), 100);
    const movedPointer = receiveAwareness(
      initial,
      event({ pointer: { ...pointer, x: 0.7 } }),
      200,
    );

    expect(movedPointer.pointerMovedAt).toBe(200);
    expect(movedPointer.cursorMovedAt).toBe(100);

    const movedCursor = receiveAwareness(
      movedPointer,
      event({
        cursor: { ...cursor, column: 6 },
        pointer: { ...pointer, x: 0.7 },
      }),
      300,
    );
    expect(movedCursor.pointerMovedAt).toBe(200);
    expect(movedCursor.cursorMovedAt).toBe(300);
  });

  it('does not revive an expired pointer from a cursor-only packet', () => {
    const initial = receiveAwareness(idleAwarenessState, event({}), 100);
    const expired = expirePointer(initial);
    const cursorOnly = receiveAwareness(
      expired,
      event({ cursor: { ...cursor, column: 6 } }),
      200,
    );

    expect(cursorOnly.pointer).toBeNull();
    expect(cursorOnly.cursor?.column).toBe(6);
  });

  it('does not revive an expired cursor from a pointer-only packet', () => {
    const initial = receiveAwareness(idleAwarenessState, event({}), 100);
    const expired = expireCursor(initial);
    const pointerOnly = receiveAwareness(
      expired,
      event({ pointer: { ...pointer, y: 0.8 } }),
      200,
    );

    expect(pointerOnly.cursor).toBeNull();
    expect(pointerOnly.pointer?.y).toBe(0.8);
  });

  it('treats the same coordinates in a replacement draft as new activity', () => {
    const initial = expireCursor(
      expirePointer(receiveAwareness(idleAwarenessState, event({}), 100)),
    );
    const replacement = receiveAwareness(
      initial,
      event({ draftId: '10000000-0000-4000-8000-000000000002' }),
      200,
    );

    expect(replacement.pointer).toEqual(pointer);
    expect(replacement.cursor).toEqual(cursor);
    expect(replacement.pointerMovedAt).toBe(200);
    expect(replacement.cursorMovedAt).toBe(200);
  });
});
