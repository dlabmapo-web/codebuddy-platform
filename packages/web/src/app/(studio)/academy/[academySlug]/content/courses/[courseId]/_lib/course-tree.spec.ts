import { describe, expect, it } from 'vitest';

import { swap } from './course-tree';

describe('course tree helpers', () => {
  it('returns a reordered copy without mutating the original IDs', () => {
    const ids = ['module-1', 'module-2', 'module-3'];

    expect(swap(ids, 0, 1)).toEqual([
      'module-2',
      'module-1',
      'module-3',
    ]);
    expect(ids).toEqual(['module-1', 'module-2', 'module-3']);
  });
});
