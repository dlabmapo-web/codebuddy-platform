import { describe, expect, it, vi } from 'vitest';
import { createRequestCache } from './requestCache';

describe('admin request cache', () => {
  it('deduplicates concurrent loads and reuses the settled value', async () => {
    const cache = createRequestCache<string, string[]>();
    const load = vi.fn(async () => ['stage']);

    const [first, second] = await Promise.all([
      cache.get('subject-1', load),
      cache.get('subject-1', load),
    ]);
    const cached = await cache.get('subject-1', load);

    expect(first).toEqual(['stage']);
    expect(second).toEqual(['stage']);
    expect(cached).toEqual(['stage']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads after invalidation or an explicit force refresh', async () => {
    const cache = createRequestCache<string, number>();
    let value = 0;
    const load = vi.fn(async () => {
      value += 1;
      return value;
    });

    expect(await cache.get('chapter-1', load)).toBe(1);
    cache.invalidate('chapter-1');
    expect(await cache.get('chapter-1', load)).toBe(2);
    expect(await cache.get('chapter-1', load, { force: true })).toBe(3);
  });
});
