import { describe, expect, it } from 'vitest';

import { academyEntryPath } from './academy-entry';

describe('academy entry destinations', () => {
  it.each([
    ['MANAGER', '/classes'],
    ['TEAM_LEAD', '/classes'],
    ['TEACHER', '/teach/classes'],
    ['STUDENT', '/learn/courses'],
  ] as const)('takes %s directly to their work page', (role, suffix) => {
    expect(academyEntryPath('cove-seoul', role)).toBe(`/academy/cove-seoul${suffix}`);
  });
});
