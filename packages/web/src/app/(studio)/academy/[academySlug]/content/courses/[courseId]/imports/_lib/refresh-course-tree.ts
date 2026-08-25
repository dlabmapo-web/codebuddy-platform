import type { QueryClient } from '@tanstack/react-query';

import { courseTreeQueryKey } from '../../_lib/course-tree';

export async function refreshCourseTreeAfterImport(
  queryClient: QueryClient,
  academyId: string,
  courseId: string,
) {
  const queryKey = courseTreeQueryKey(academyId, courseId);
  try {
    await queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
  } catch {
    // The import already committed. Removing a tree that could not be
    // refreshed makes the builder use its fresh server payload instead of
    // showing the pre-import cache until the user reloads the page.
    queryClient.removeQueries({ queryKey });
  }
}
