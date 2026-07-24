import { describe, expect, it } from 'vitest';

import { countIssuesByModule, swap } from './course-tree';

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

  it('groups validation issues by module and ignores course-level issues', () => {
    const counts = countIssuesByModule([
      {
        code: 'MODULE_TITLE_REQUIRED',
        message: 'Missing title',
        path: 'modules.0.title',
        moduleId: 'module-1',
        lectureId: null,
        materialId: null,
      },
      {
        code: 'LECTURE_REQUIRED',
        message: 'Missing lecture',
        path: 'modules.0.lectures',
        moduleId: 'module-1',
        lectureId: null,
        materialId: null,
      },
      {
        code: 'COURSE_TITLE_REQUIRED',
        message: 'Missing course title',
        path: 'course.title',
        moduleId: null,
        lectureId: null,
        materialId: null,
      },
    ]);

    expect(counts.get('module-1')).toBe(2);
    expect(counts.size).toBe(1);
  });
});
