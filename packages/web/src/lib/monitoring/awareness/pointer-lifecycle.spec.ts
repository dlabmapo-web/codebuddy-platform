import { monitoringTiming, type CollaborationPointer } from '@cove/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  expiresWhenIdle,
  idleExpiryFor,
  scheduleRemoteAwarenessExpiry,
  scheduleRemotePointerExpiry,
  staysUntilCleared,
} from './pointer-lifecycle';

const overEditor: CollaborationPointer = { surface: 'editor', x: 0.4, y: 0.6 };
const overStatement: CollaborationPointer = {
  surface: 'statement',
  x: 0.1,
  y: 0.2,
};

describe('idleExpiryFor', () => {
  it('gives a fading pointer the shared three-second budget', () => {
    // One source for the duration: a component constant here is how a client
    // ends up hiding an arrow the rest of the system still considers live.
    expect(idleExpiryFor(expiresWhenIdle, overEditor)).toBe(
      monitoringTiming.pointerExpiryMs,
    );
  });

  it('gives a held pointer no deadline at all', () => {
    expect(idleExpiryFor(staysUntilCleared, overEditor)).toBeNull();
  });

  it('schedules nothing for a pointer that is already absent', () => {
    // Both policies agree: there is no arrow to remove, so there is no timer
    // to leave running against a hook that may since have moved on.
    expect(idleExpiryFor(expiresWhenIdle, null)).toBeNull();
    expect(idleExpiryFor(staysUntilCleared, null)).toBeNull();
  });
});

describe('scheduleRemotePointerExpiry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the pointer for the full three seconds, then drops it', () => {
    const expired = vi.fn();
    scheduleRemotePointerExpiry(expiresWhenIdle, overEditor, expired);

    vi.advanceTimersByTime(monitoringTiming.pointerExpiryMs - 1);
    expect(expired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('measures the deadline from the newest position, not the first', () => {
    const expired = vi.fn();
    // What a moving mouse does: each arrival disarms the previous countdown
    // before arming its own, so a pointer in continuous motion never expires.
    let cancel = scheduleRemotePointerExpiry(
      expiresWhenIdle,
      overStatement,
      expired,
    );
    vi.advanceTimersByTime(2_500);
    cancel?.();
    cancel = scheduleRemotePointerExpiry(expiresWhenIdle, overEditor, expired);

    vi.advanceTimersByTime(2_500);
    expect(expired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('leaves a held pointer alone however long the peer sits still', () => {
    const expired = vi.fn();
    const cancel = scheduleRemotePointerExpiry(
      staysUntilCleared,
      overEditor,
      expired,
    );

    expect(cancel).toBeUndefined();
    vi.advanceTimersByTime(monitoringTiming.pointerExpiryMs * 10);
    expect(expired).not.toHaveBeenCalled();
  });

  it('cannot fire after it has been cancelled', () => {
    // Unmounting, or moving to another draft. A timer that outlives the state
    // it was measured from must not reach back into it.
    const expired = vi.fn();
    const cancel = scheduleRemotePointerExpiry(
      expiresWhenIdle,
      overEditor,
      expired,
    );
    cancel?.();

    vi.advanceTimersByTime(monitoringTiming.pointerExpiryMs * 2);
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('scheduleRemoteAwarenessExpiry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses the same policy for a Monaco caret', () => {
    const expired = vi.fn();
    const caret = {
      line: 4,
      column: 7,
      selectionEndLine: null,
      selectionEndColumn: null,
    };
    scheduleRemoteAwarenessExpiry(expiresWhenIdle, caret, expired);

    vi.advanceTimersByTime(monitoringTiming.pointerExpiryMs - 1);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('keeps a held Monaco caret until collaboration clears it', () => {
    const expired = vi.fn();
    scheduleRemoteAwarenessExpiry(
      staysUntilCleared,
      { line: 2, column: 5 },
      expired,
    );

    vi.advanceTimersByTime(monitoringTiming.pointerExpiryMs * 10);
    expect(expired).not.toHaveBeenCalled();
  });
});
