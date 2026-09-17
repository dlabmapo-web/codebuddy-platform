import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }));

const { redirectIfExerciseMoved } = await import('./moved-exercise');
import type { CourseTree } from './course-tree';

const tree = {
  course: { id: 'c', title: 'C', isVisible: true },
  modules: [
    {
      id: 'M1',
      title: 'M1',
      position: 1,
      isVisible: true,
      lectures: [
        { id: 'L1', title: 'L1', position: 1, isVisible: true, materials: [] },
        {
          id: 'L2',
          title: 'L2',
          position: 2,
          isVisible: true,
          materials: [{ id: 'P1', title: 'P1', position: 1, isVisible: true }],
        },
      ],
    },
  ],
} as unknown as CourseTree;

const run = (lectureId: string, materialId: string, loadTree = async () => tree) =>
  redirectIfExerciseMoved({
    exercisePath: (current) => `/lectures/${current}/exercises/${materialId}`,
    lectureId,
    loadTree,
    materialId,
  });

describe('redirectIfExerciseMoved', () => {
  it('follows a problem to the lecture it moved to', async () => {
    await expect(run('L1', 'P1')).rejects.toThrow('redirect:/lectures/L2/exercises/P1');
  });

  it('does nothing when the problem is where the URL says, gone, or the tree is unreadable', async () => {
    redirect.mockClear();
    await run('L2', 'P1');
    await run('L1', 'missing');
    await run('L1', 'P1', async () => {
      throw new Error('offline');
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
