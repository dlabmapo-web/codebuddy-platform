import { describe, expect, it } from 'vitest';

import type { CourseTree } from './course-tree';
import { acceptsKind, dropEdge, resolveDrop } from './drag-drop';

/** M1: L1 [P1, P2, P3], L2 [P4]   M2: L3 [], L4 [P5] */
function fixture(): CourseTree {
  const material = (id: string) => ({ id, title: id, position: 0, isVisible: true });
  const lecture = (id: string, materials: string[]) => ({
    id,
    title: id,
    position: 0,
    isVisible: true,
    materials: materials.map(material),
  });
  return {
    course: { id: 'course', title: 'C', isVisible: true },
    modules: [
      { id: 'M1', title: 'M1', position: 1, isVisible: true, lectures: [lecture('L1', ['P1', 'P2', 'P3']), lecture('L2', ['P4'])] },
      { id: 'M2', title: 'M2', position: 2, isVisible: true, lectures: [lecture('L3', []), lecture('L4', ['P5'])] },
    ],
  } as unknown as CourseTree;
}

const problem = (id: string) => ({ kind: 'exercise' as const, id });
const problemRow = (id: string) => ({ row: { kind: 'exercise' as const, id } });
const lectureHeader = (id: string) => ({
  row: { kind: 'lecture' as const, id },
  container: { accepts: 'exercise' as const, parentId: id },
});

describe('drop targets', () => {
  it('accept only the kinds they are for', () => {
    expect(acceptsKind(lectureHeader('L1'), 'exercise')).toBe(true);
    expect(acceptsKind(lectureHeader('L1'), 'lecture')).toBe(true);
    expect(acceptsKind(lectureHeader('L1'), 'module')).toBe(false);
    expect(acceptsKind(problemRow('P1'), 'lecture')).toBe(false);
  });

  it('place a sibling before or after by the pointer, and a child inside', () => {
    expect(dropEdge(problemRow('P1'), 'exercise', false)).toBe('before');
    expect(dropEdge(problemRow('P1'), 'exercise', true)).toBe('after');
    expect(dropEdge(lectureHeader('L1'), 'exercise', true)).toBe('inside');
    expect(dropEdge(lectureHeader('L1'), 'lecture', true)).toBe('after');
    expect(dropEdge(problemRow('P1'), 'module', true)).toBeNull();
  });
});

describe('resolveDrop', () => {
  it('moves a problem down within its lecture, counting without itself', () => {
    expect(resolveDrop(fixture(), problem('P1'), problemRow('P2'), 'after')).toEqual({
      kind: 'exercise',
      itemId: 'P1',
      to: { parentId: 'L1', index: 1 },
    });
    expect(resolveDrop(fixture(), problem('P1'), problemRow('P3'), 'after')).toMatchObject({
      to: { parentId: 'L1', index: 2 },
    });
  });

  it('moves a problem up within its lecture', () => {
    expect(resolveDrop(fixture(), problem('P3'), problemRow('P1'), 'before')).toMatchObject({
      to: { parentId: 'L1', index: 0 },
    });
  });

  it('ignores drops that land where the item already is', () => {
    expect(resolveDrop(fixture(), problem('P2'), problemRow('P1'), 'after')).toBeNull();
    expect(resolveDrop(fixture(), problem('P2'), problemRow('P3'), 'before')).toBeNull();
    expect(resolveDrop(fixture(), problem('P2'), problemRow('P2'), 'after')).toBeNull();
  });

  it('moves a problem into another chapter\'s lecture beside a problem', () => {
    expect(resolveDrop(fixture(), problem('P1'), problemRow('P5'), 'before')).toMatchObject({
      to: { parentId: 'L4', index: 0 },
    });
  });

  it('appends a problem dropped on a lecture header, including an empty one', () => {
    expect(resolveDrop(fixture(), problem('P1'), lectureHeader('L3'), 'inside')).toMatchObject({
      to: { parentId: 'L3', index: 0 },
    });
    expect(resolveDrop(fixture(), problem('P1'), lectureHeader('L2'), 'inside')).toMatchObject({
      to: { parentId: 'L2', index: 1 },
    });
  });

  it('moves a lecture to another chapter, or onto a chapter header', () => {
    expect(
      resolveDrop(fixture(), { kind: 'lecture', id: 'L1' }, lectureHeader('L4'), 'before'),
    ).toMatchObject({ kind: 'lecture', to: { parentId: 'M2', index: 1 } });
    expect(
      resolveDrop(
        fixture(),
        { kind: 'lecture', id: 'L2' },
        { row: { kind: 'module', id: 'M2' }, container: { accepts: 'lecture', parentId: 'M2' } },
        'inside',
      ),
    ).toMatchObject({ to: { parentId: 'M2', index: 2 } });
  });

  it('reorders chapters', () => {
    expect(
      resolveDrop(fixture(), { kind: 'module', id: 'M1' }, { row: { kind: 'module', id: 'M2' } }, 'after'),
    ).toEqual({ kind: 'module', itemId: 'M1', to: { parentId: 'course', index: 1 } });
  });

  it('refuses a target of the wrong kind', () => {
    expect(resolveDrop(fixture(), problem('P1'), { row: { kind: 'lecture', id: 'L2' } }, 'after')).toBeNull();
  });
});
