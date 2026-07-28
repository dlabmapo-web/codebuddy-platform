import { describe, expect, it } from 'vitest';
import {
  resolveProblemNeighbors,
  type ProblemNavigationCandidate,
} from './navigation';

function problem(
  id: string,
  chapterOrder: number,
  problemOrder: number,
  overrides: Partial<ProblemNavigationCandidate> = {},
): ProblemNavigationCandidate {
  return {
    id,
    problem_no: Number(id.replace(/\D/g, '')) || 1,
    title: `Problem ${id}`,
    chapter_id: `chapter-${chapterOrder}`,
    chapter_order_no: chapterOrder,
    problem_order_no: problemOrder,
    is_published: true,
    ...overrides,
  };
}

describe('resolveProblemNeighbors', () => {
  it('resolves neighbors inside one chapter', () => {
    const result = resolveProblemNeighbors([
      problem('p1', 1, 1),
      problem('p2', 1, 2),
      problem('p3', 1, 3),
    ], 'p2');

    expect(result.previous?.id).toBe('p1');
    expect(result.next?.id).toBe('p3');
  });

  it('crosses chapter boundaries in both directions', () => {
    const candidates = [
      problem('p1', 1, 1),
      problem('p2', 1, 2),
      problem('p3', 2, 1),
      problem('p4', 2, 2),
    ];

    expect(resolveProblemNeighbors(candidates, 'p2')).toMatchObject({
      previous: { id: 'p1' },
      next: { id: 'p3' },
    });
    expect(resolveProblemNeighbors(candidates, 'p3')).toMatchObject({
      previous: { id: 'p2' },
      next: { id: 'p4' },
    });
  });

  it('returns null at the first and final stage boundaries', () => {
    const candidates = [
      problem('p1', 1, 1),
      problem('p2', 2, 1),
    ];

    expect(resolveProblemNeighbors(candidates, 'p1').previous).toBeNull();
    expect(resolveProblemNeighbors(candidates, 'p2').next).toBeNull();
  });

  it('excludes unpublished problems', () => {
    const candidates = [
      problem('p1', 1, 1),
      problem('p2', 1, 2, { is_published: false }),
      problem('p3', 1, 3),
    ];

    expect(resolveProblemNeighbors(candidates, 'p1').next?.id).toBe('p3');
  });

  it('uses problem number and id as stable order tie-breakers', () => {
    const candidates = [
      problem('z', 1, 1, { problem_no: 10 }),
      problem('b', 1, 1, { problem_no: 20 }),
      problem('a', 1, 1, { problem_no: 20 }),
    ];

    expect(resolveProblemNeighbors(candidates, 'a')).toMatchObject({
      previous: { id: 'z' },
      next: { id: 'b' },
    });
  });

  it('returns empty neighbors when the current problem is unavailable', () => {
    expect(resolveProblemNeighbors([problem('p1', 1, 1)], 'missing')).toEqual({
      previous: null,
      next: null,
    });
  });
});
