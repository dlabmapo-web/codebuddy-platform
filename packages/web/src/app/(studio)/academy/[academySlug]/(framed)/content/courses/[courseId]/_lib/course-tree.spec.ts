import { describe, expect, it } from 'vitest';

import {
  destinationCount,
  filterDestinations,
  locateItem,
  moveDestinations,
  movedTree,
  positionOptions,
  reordered,
  visibilityAfterMove,
  withVisibility,
  type CourseTree,
} from './course-tree';

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

/**
 * 1 기초 (visible)       1-1 L1 [P1, P2, P3]   1-2 L2 [P4]
 * 2 문자열 (visible)     2-1 L3 [P5]           2-2 L4 (hidden) []
 * 3 초안 (hidden)        3-1 L5 [P6]
 */
function fixture(courseVisible = true): CourseTree {
  const material = (id: string, isVisible = true) => ({ id, title: id, position: 0, isVisible });
  const lecture = (id: string, materials: ReturnType<typeof material>[], isVisible = true) => ({
    id,
    title: id,
    position: 0,
    isVisible,
    materials,
  });
  return {
    course: { id: 'course', title: '파이썬', isVisible: courseVisible },
    modules: [
      {
        id: 'M1',
        title: '기초',
        position: 1,
        isVisible: true,
        lectures: [lecture('L1', [material('P1'), material('P2'), material('P3')]), lecture('L2', [material('P4')])],
      },
      {
        id: 'M2',
        title: '문자열',
        position: 2,
        isVisible: true,
        lectures: [lecture('L3', [material('P5')]), lecture('L4', [], false)],
      },
      {
        id: 'M3',
        title: '초안',
        position: 3,
        isVisible: false,
        lectures: [lecture('L5', [material('P6', false)])],
      },
    ],
  } as unknown as CourseTree;
}

describe('moving across parents', () => {
  it('groups lectures under their chapter, marks the current one, and counts siblings without the item', () => {
    const groups = moveDestinations(fixture(), 'exercise', 'P2');

    expect(groups.map((group) => group.title)).toEqual(['기초', '문자열', '초안']);
    expect(groups[0]!.parents).toEqual([
      { id: 'L1', title: 'L1', childCount: 2, hidden: false, current: true },
      { id: 'L2', title: 'L2', childCount: 1, hidden: false, current: false },
    ]);
    expect(groups[1]!.parents[1]).toMatchObject({ id: 'L4', hidden: true });
    expect(groups[2]!.parents[0]).toMatchObject({ id: 'L5', hidden: true });
    expect(destinationCount(groups)).toBe(5);
  });

  it('offers chapters as a lecture\'s destinations', () => {
    const [group] = moveDestinations(fixture(), 'lecture', 'L3');

    expect(group!.parents.map((parent) => [parent.id, parent.childCount, parent.current, parent.hidden])).toEqual([
      ['M1', 2, false, false],
      ['M2', 1, true, false],
      ['M3', 1, false, true],
    ]);
  });

  it('locates an item, or reports it gone', () => {
    expect(locateItem(fixture(), 'exercise', 'P3')).toEqual({ parentId: 'L1', index: 2, title: 'P3' });
    expect(locateItem(fixture(), 'lecture', 'L4')).toEqual({ parentId: 'M2', index: 1, title: 'L4' });
    expect(locateItem(fixture(), 'exercise', 'missing')).toBeNull();
  });

  it('lists positions in the current parent with the item\'s own place marked and preselected', () => {
    const { options, defaultIndex } = positionOptions(fixture(), 'exercise', 'P2', 'L1');

    expect(options).toEqual([
      { index: 0, label: { kind: 'first' }, current: false },
      { index: 1, label: { kind: 'after', title: 'P1' }, current: true },
      { index: 2, label: { kind: 'last' }, current: false },
    ]);
    expect(defaultIndex).toBe(1);
  });

  it('preselects last in another parent, and offers one place in an empty one', () => {
    expect(positionOptions(fixture(), 'exercise', 'P2', 'L3')).toEqual({
      options: [
        { index: 0, label: { kind: 'first' }, current: false },
        { index: 1, label: { kind: 'last' }, current: false },
      ],
      defaultIndex: 1,
    });
    expect(positionOptions(fixture(), 'exercise', 'P2', 'L4')).toEqual({
      options: [{ index: 0, label: { kind: 'only' }, current: false }],
      defaultIndex: 0,
    });
  });

  it('warns when a move hides a visible problem, naming what hides it', () => {
    expect(visibilityAfterMove(fixture(), 'exercise', 'P1', 'L4')).toEqual({ now: true, after: false, hiddenBy: 'L4' });
    expect(visibilityAfterMove(fixture(), 'exercise', 'P1', 'L5')).toEqual({ now: true, after: false, hiddenBy: '초안' });
    expect(visibilityAfterMove(fixture(), 'lecture', 'L1', 'M3')).toEqual({ now: true, after: false, hiddenBy: '초안' });
  });

  it('reports a problem becoming visible when it leaves a hidden parent', () => {
    const tree = fixture();
    tree.modules[2]!.lectures[0]!.materials[0]!.isVisible = true;

    expect(visibilityAfterMove(tree, 'exercise', 'P6', 'L1')).toEqual({ now: false, after: true, hiddenBy: null });
  });

  it('reports no change for an item hidden by its own flag, or in a hidden course', () => {
    expect(visibilityAfterMove(fixture(), 'exercise', 'P6', 'L1')).toMatchObject({ now: false, after: false });
    expect(visibilityAfterMove(fixture(false), 'exercise', 'P1', 'L3')).toEqual({ now: false, after: false, hiddenBy: '파이썬' });
  });

  it('filters by lecture title, or keeps a whole chapter whose title matches', () => {
    const groups = moveDestinations(fixture(), 'exercise', 'P1');

    expect(filterDestinations(groups, 'l3').map((group) => [group.title, group.parents.map((p) => p.id)])).toEqual([
      ['문자열', ['L3']],
    ]);
    expect(filterDestinations(groups, '문자').map((group) => group.parents.map((p) => p.id))).toEqual([['L3', 'L4']]);
    expect(filterDestinations(groups, '  ')).toHaveLength(3);
  });

  it('builds the tree after a move, and moving back restores it', () => {
    const tree = fixture();
    const moved = movedTree(tree, 'exercise', 'P1', { parentId: 'L3', index: 1 });

    expect(moved.modules[0]!.lectures[0]!.materials.map((item) => item.id)).toEqual(['P2', 'P3']);
    expect(moved.modules[1]!.lectures[0]!.materials.map((item) => item.id)).toEqual(['P5', 'P1']);
    expect(movedTree(moved, 'exercise', 'P1', { parentId: 'L1', index: 0 })).toEqual(tree);

    const lectureMoved = movedTree(tree, 'lecture', 'L1', { parentId: 'M2', index: 2 });
    expect(lectureMoved.modules[1]!.lectures.map((item) => item.id)).toEqual(['L3', 'L4', 'L1']);
    expect(movedTree(lectureMoved, 'lecture', 'L1', { parentId: 'M1', index: 0 })).toEqual(tree);
  });
});

describe('withVisibility', () => {
  it('flips exactly one flag at each level and leaves the rest untouched', () => {
    const tree = fixture();

    expect(withVisibility(tree, 'course', 'course', false).course.isVisible).toBe(false);
    expect(withVisibility(tree, 'module', 'M3', true).modules[2]!.isVisible).toBe(true);
    expect(withVisibility(tree, 'lecture', 'L4', true).modules[1]!.lectures[1]!.isVisible).toBe(true);

    const flipped = withVisibility(tree, 'exercise', 'P2', false);
    expect(flipped.modules[0]!.lectures[0]!.materials.map((item) => item.isVisible)).toEqual([true, false, true]);
    expect(flipped.modules[1]).toEqual(tree.modules[1]);
    expect(tree.modules[0]!.lectures[0]!.materials[1]!.isVisible).toBe(true);
  });
});
