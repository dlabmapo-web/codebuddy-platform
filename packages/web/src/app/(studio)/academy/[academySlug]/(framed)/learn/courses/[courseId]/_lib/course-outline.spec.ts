import { describe, expect, it } from 'vitest';

import {
  formatProblemOutlineNumber,
  isOutlineItemExpanded,
  lectureProgress,
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

describe('lectureProgress', () => {
  const exercise = (status: string) => ({ status });

  it('counts solved problems against the visible total', () => {
    expect(
      lectureProgress({
        exercises: [
          exercise('SOLVED'),
          exercise('IN_PROGRESS'),
          exercise('NOT_STARTED'),
          exercise('SOLVED'),
        ],
      }),
    ).toEqual({ total: 4, solved: 2, percent: 50 });
  });

  it('reports a finished lecture as complete', () => {
    expect(
      lectureProgress({ exercises: [exercise('SOLVED')] }),
    ).toEqual({ total: 1, solved: 1, percent: 100 });
  });

  /** A heading lecture is not 0% done; an empty bar would claim it is. */
  it('has no percentage for a lecture with no problems', () => {
    expect(lectureProgress({ exercises: [] })).toEqual({
      total: 0,
      solved: 0,
      percent: null,
    });
  });

  it('does not count started work as solved', () => {
    expect(
      lectureProgress({
        exercises: [exercise('IN_PROGRESS'), exercise('NOT_STARTED')],
      }).percent,
    ).toBe(0);
  });
});
