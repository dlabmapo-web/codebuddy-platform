import { describe, expect, it, vi } from 'vitest';

import { DRAFT_FLUSH_TIMEOUT_MS, flushDrafts, registerDraftFlush } from './draft-flush';

describe('draft logout flush registry', () => {
  it('awaits every mounted draft before reporting success', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const removeFirst = registerDraftFlush(first);
    const removeSecond = registerDraftFlush(second);

    await expect(flushDrafts()).resolves.toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    removeFirst();
    removeSecond();
  });

  it('reports failure without skipping another draft and unregisters on unmount', async () => {
    const failed = vi.fn().mockRejectedValue(new Error('offline'));
    const saved = vi.fn().mockResolvedValue(undefined);
    const removeFailed = registerDraftFlush(failed);
    const removeSaved = registerDraftFlush(saved);

    await expect(flushDrafts()).resolves.toBe(false);
    expect(saved).toHaveBeenCalledOnce();
    removeFailed();
    removeSaved();
    await expect(flushDrafts()).resolves.toBe(true);
  });
});


describe('draft flush failure bounds', () => {
  it('does not let a synchronous throw skip other drafts or block logout', async () => {
    const removeBroken = registerDraftFlush(() => { throw new Error('broken editor'); });
    const saved = vi.fn().mockResolvedValue(undefined);
    const removeSaved = registerDraftFlush(saved);
    try {
      await expect(flushDrafts()).resolves.toBe(false);
      expect(saved).toHaveBeenCalledOnce();
    } finally {
      removeBroken();
      removeSaved();
    }
  });

  it('bounds a stalled network save so expiry still logs out', async () => {
    vi.useFakeTimers();
    const remove = registerDraftFlush(() => new Promise(() => {}));
    try {
      const result = flushDrafts();
      await vi.advanceTimersByTimeAsync(DRAFT_FLUSH_TIMEOUT_MS);
      await expect(result).resolves.toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      remove();
      vi.useRealTimers();
    }
  });
});
