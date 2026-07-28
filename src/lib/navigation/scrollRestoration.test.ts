import { describe, expect, it, vi } from 'vitest';
import {
  readScrollPosition,
  saveScrollPosition,
  scrollRestorationKey,
} from './scrollRestoration';

describe('scroll restoration', () => {
  it('isolates keys by route and identity', () => {
    expect(scrollRestorationKey('/problems', 'stage-1'))
      .not.toBe(scrollRestorationKey('/problems', 'stage-2'));
  });

  it('rounds and restores a saved position once', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    saveScrollPosition(storage, 'key', 42.6);
    expect(readScrollPosition(storage, 'key')).toBe(43);
    expect(storage.removeItem).toHaveBeenCalledWith('key');
  });

  it('rejects invalid stored values', () => {
    const storage = {
      getItem: () => 'not-a-number',
      removeItem: vi.fn(),
    };
    expect(readScrollPosition(storage, 'key')).toBeNull();
  });
});

