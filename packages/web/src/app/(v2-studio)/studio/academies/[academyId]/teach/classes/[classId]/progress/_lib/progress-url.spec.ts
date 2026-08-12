import { describe, expect, it } from 'vitest';

import {
  emptyProgressQuery,
  parseProgressQuery,
  progressPath,
  reviewPath,
  safeReturnTo,
  serializeProgressQuery,
  withCourseSelection,
  withModuleSelection,
  withProgressChange,
  withProgressPage,
  withProgressView,
} from './progress-url';

const academyId = 'a1111111-1111-4111-8111-111111111111';
const classId = 'c1111111-1111-4111-8111-111111111111';
const courseId = '11111111-1111-4111-8111-111111111111';
const moduleId = '22222222-2222-4222-8222-222222222222';
const lectureId = '33333333-3333-4333-8333-333333333333';
const membershipId = '44444444-4444-4444-8444-444444444444';
const materialId = '55555555-5555-4555-8555-555555555555';

describe('parseProgressQuery', () => {
  it('defaults to the by-student lens', () => {
    expect(parseProgressQuery('')).toEqual(emptyProgressQuery);
    expect(parseProgressQuery('view=nonsense').view).toBe('students');
  });

  it('keeps the supported filters and drops everything else', () => {
    const query = parseProgressQuery(
      `view=problems&course=${courseId}&status=solved&status=made_up` +
        '&attention=stalled&attention=nope&q=  ada  &page=3',
    );
    expect(query).toMatchObject({
      view: 'problems',
      courseIds: [courseId],
      statuses: ['solved'],
      attention: ['stalled'],
      q: 'ada',
      page: 3,
    });
  });

  it('drops a non-uuid id rather than asking the server about it', () => {
    expect(parseProgressQuery('student=not-a-uuid').membershipId).toBeNull();
    expect(parseProgressQuery('course=1&course=2').courseIds).toEqual([]);
  });

  it('refuses a page that is not a positive integer', () => {
    for (const value of ['0', '-2', '1.5', 'abc']) {
      expect(parseProgressQuery(`page=${value}`).page).toBe(1);
    }
  });

  it('drops a selection that belongs to the other lens', () => {
    // A URL naming both a student and a problem describes no screen.
    expect(
      parseProgressQuery(`student=${membershipId}&problem=${materialId}`),
    ).toMatchObject({ membershipId, materialId: null });
    expect(
      parseProgressQuery(
        `view=problems&student=${membershipId}&problem=${materialId}`,
      ),
    ).toMatchObject({ membershipId: null, materialId });
  });

  it('drops a child curriculum id without its parent', () => {
    expect(
      parseProgressQuery(`module=${moduleId}&lecture=${lectureId}`),
    ).toMatchObject({ moduleId: null, lectureId: null });
    expect(
      parseProgressQuery(
        `course=${courseId}&module=${moduleId}&lecture=${lectureId}`,
      ),
    ).toMatchObject({ moduleId, lectureId });
  });

  it('ignores a direction with no sorted column', () => {
    expect(parseProgressQuery('direction=asc').direction).toBe('desc');
    expect(parseProgressQuery('sort=completion&direction=asc')).toMatchObject({
      sort: 'completion',
      direction: 'asc',
    });
  });
});

describe('serializeProgressQuery', () => {
  it('omits every default', () => {
    expect(serializeProgressQuery(emptyProgressQuery)).toBe('');
  });

  it('round-trips a full state', () => {
    const query = parseProgressQuery(
      `view=problems&q=loops&course=${courseId}&module=${moduleId}` +
        `&lecture=${lectureId}&attention=long_solve&problem=${materialId}&page=2`,
    );
    expect(parseProgressQuery(serializeProgressQuery(query))).toEqual(query);
  });

  it('produces one address per state', () => {
    const left = parseProgressQuery(`status=solved&course=${courseId}`);
    const right = parseProgressQuery(`course=${courseId}&status=solved`);
    expect(serializeProgressQuery(left)).toBe(serializeProgressQuery(right));
  });
});

describe('transitions', () => {
  it('resets the page whenever the question changes', () => {
    const paged = withProgressPage(emptyProgressQuery, 4);
    expect(withProgressChange(paged, { q: 'ada' }).page).toBe(1);
  });

  it('switching lens keeps the curriculum and drops the selection', () => {
    const query = withProgressChange(emptyProgressQuery, {
      courseIds: [courseId],
      membershipId,
      sort: 'completion',
    });
    const switched = withProgressView(query, 'problems');
    expect(switched).toMatchObject({
      view: 'problems',
      courseIds: [courseId],
      membershipId: null,
      materialId: null,
      sort: null,
    });
  });

  it('choosing a different course clears what it invalidated', () => {
    const query = withModuleSelection(
      withCourseSelection(emptyProgressQuery, [courseId]),
      moduleId,
    );
    expect(query.moduleId).toBe(moduleId);
    expect(withCourseSelection(query, []).moduleId).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it('accepts this class own progress path and canonicalizes it', () => {
    const path = progressPath(academyId, classId, {
      ...emptyProgressQuery,
      membershipId,
    });
    expect(safeReturnTo(academyId, classId, encodeURIComponent(path))).toBe(
      path,
    );
  });

  it('falls back for anything else', () => {
    const root = progressPath(academyId, classId, emptyProgressQuery);
    for (const candidate of [
      undefined,
      null,
      '',
      'https://evil.example.com',
      '//evil.example.com',
      '/studio/academies/other/teach/classes/x/progress',
      `/studio/academies/${academyId}/teach/classes/other/progress`,
      '%E0%A4%A',
    ]) {
      expect(safeReturnTo(academyId, classId, candidate)).toBe(root);
    }
  });
});

describe('reviewPath', () => {
  it('addresses a student by membership and carries the way back', () => {
    const returnTo = progressPath(academyId, classId, emptyProgressQuery);
    const path = reviewPath({
      academyId,
      classId,
      membershipId,
      submissionId: materialId,
      returnTo,
    });
    expect(path).toContain(`/students/${membershipId}/submissions/${materialId}`);
    expect(path).toContain(`returnTo=${encodeURIComponent(returnTo)}`);
  });
});
