import { describe, expect, it } from 'vitest';

import {
  formatProblemOutlineNumber,
  isOutlineItemExpanded,
  toggleCollapsedId,
} from './course-outline';

describe('student course outline', () => {
  it('uses the same hierarchical problem number as the curriculum builder', () => {
    expect(formatProblemOutlineNumber(1, 1, 1)).toBe('1-1-1');
    expect(formatProblemOutlineNumber(2, 3, 4)).toBe('2-3-4');
  });

  it('collapses and expands one outline item without mutating sibling state', () => {
    const initial = new Set(['lecture-2']);
    const collapsed = toggleCollapsedId(initial, 'lecture-1');

    expect(initial).toEqual(new Set(['lecture-2']));
    expect(collapsed).toEqual(new Set(['lecture-2', 'lecture-1']));
    expect(toggleCollapsedId(collapsed, 'lecture-1')).toEqual(
      new Set(['lecture-2']),
    );
  });

  it('forces search results and deep links open over collapsed state', () => {
    const collapsedIds = new Set(['lecture-1']);

    expect(
      isOutlineItemExpanded({
        collapsedIds,
        forceExpanded: false,
        id: 'lecture-1',
      }),
    ).toBe(false);
    expect(
      isOutlineItemExpanded({
        collapsedIds,
        forceExpanded: true,
        id: 'lecture-1',
      }),
    ).toBe(true);
  });
});
