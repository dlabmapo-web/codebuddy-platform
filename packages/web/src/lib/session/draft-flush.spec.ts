import { describe, expect, it, vi } from 'vitest';

import { flushDrafts, registerDraftFlush } from './draft-flush';

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
