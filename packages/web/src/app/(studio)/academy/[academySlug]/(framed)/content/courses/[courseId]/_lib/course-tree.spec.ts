import { describe, expect, it } from 'vitest';

import { reordered } from './course-tree';

describe('reordered', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an item down, shifting the ones it passes', () => {
    expect(reordered(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up, shifting the ones it passes', () => {
    expect(reordered(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('moves to first and to last', () => {
    expect(reordered(ids, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(reordered(ids, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('returns the same ordering when moved to its own place', () => {
    expect(reordered(ids, 2, 2)).toEqual(ids);
  });

  it('never mutates the list it was given', () => {
    reordered(ids, 0, 3);

    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  /*
   * The server is handed the complete ordering and checks the set matches
   * exactly, so an index from a stale render must still yield every id — a
   * clamp, never a drop.
   */
  it('clamps an out-of-range destination instead of losing the item', () => {
    expect(reordered(ids, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(reordered(ids, 0, -5)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores a source index that is not in the list', () => {
    expect(reordered(ids, 9, 0)).toEqual(ids);
  });
});
