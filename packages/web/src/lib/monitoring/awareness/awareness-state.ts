import type {
  AwarenessChangedEvent,
  CollaborationCursor,
  CollaborationPointer,
} from '@cove/shared';

export type ReceivedAwarenessState = {
  draftId: string | null;
  cursor: CollaborationCursor | null;
  pointer: CollaborationPointer | null;
  cursorMovedAt: number;
  pointerMovedAt: number;
  /** Last wire values remain after their visible marker expires. */
  receivedCursor: CollaborationCursor | null;
  receivedPointer: CollaborationPointer | null;
};

export const idleAwarenessState: ReceivedAwarenessState = {
  draftId: null,
  cursor: null,
  pointer: null,
  cursorMovedAt: 0,
  pointerMovedAt: 0,
  receivedCursor: null,
  receivedPointer: null,
};

/**
 * Applies one combined wire packet without confusing pointer activity with
 * cursor activity. The gateway intentionally sends both current values in one
 * compact event, even when only one changed.
 */
export function receiveAwareness(
  current: ReceivedAwarenessState,
  event: AwarenessChangedEvent,
  receivedAt: number,
): ReceivedAwarenessState {
  const sameDraft = current.draftId === event.draftId;
  const pointerChanged =
    !sameDraft || !samePointer(current.receivedPointer, event.pointer);
  const cursorChanged =
    !sameDraft || !sameCursor(current.receivedCursor, event.cursor);

  return {
    draftId: event.draftId,
    receivedCursor: event.cursor,
    receivedPointer: event.pointer,
    cursor: cursorChanged ? event.cursor : sameDraft ? current.cursor : null,
    pointer: pointerChanged ? event.pointer : sameDraft ? current.pointer : null,
    cursorMovedAt: cursorChanged
      ? receivedAt
      : sameDraft
        ? current.cursorMovedAt
        : 0,
    pointerMovedAt: pointerChanged
      ? receivedAt
      : sameDraft
        ? current.pointerMovedAt
        : 0,
  };
}

export function expireCursor(
  current: ReceivedAwarenessState,
): ReceivedAwarenessState {
  return { ...current, cursor: null };
}

export function expirePointer(
  current: ReceivedAwarenessState,
): ReceivedAwarenessState {
  return { ...current, pointer: null };
}

function sameCursor(
  left: CollaborationCursor | null,
  right: CollaborationCursor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.line === right.line &&
    left.column === right.column &&
    left.selectionEndLine === right.selectionEndLine &&
    left.selectionEndColumn === right.selectionEndColumn
  );
}

function samePointer(
  left: CollaborationPointer | null,
  right: CollaborationPointer | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.surface === right.surface && left.x === right.x && left.y === right.y
  );
}
