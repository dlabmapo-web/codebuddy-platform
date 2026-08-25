import { describe, expect, it, vi } from 'vitest';

import { refreshCourseTreeAfterImport } from './refresh-course-tree';

const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = '40000000-0000-4000-8000-000000000001';

describe('refreshCourseTreeAfterImport', () => {
  it('refetches the exact inactive query used by the course builder', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      removeQueries: vi.fn(),
    };

    await refreshCourseTreeAfterImport(queryClient as never, academyId, courseId);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['academy', academyId, 'course', courseId],
      refetchType: 'all',
    });
    expect(queryClient.removeQueries).not.toHaveBeenCalled();
  });

  it('removes stale data when the proactive refresh fails', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockRejectedValue(new Error('offline')),
      removeQueries: vi.fn(),
    };

    await refreshCourseTreeAfterImport(queryClient as never, academyId, courseId);

    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: ['academy', academyId, 'course', courseId],
    });
  });
});
