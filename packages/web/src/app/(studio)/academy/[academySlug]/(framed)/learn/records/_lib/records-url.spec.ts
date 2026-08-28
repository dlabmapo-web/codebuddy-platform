import { describe, expect, it } from 'vitest';

import {
  emptyRecordsQuery,
  parseRecordsQuery,
  pruneOrphanedFacets,
  recordsPath,
  safeReturnTo,
  serializeRecordsQuery,
  withRecordsPage,
  withRecordsQueryChange,
} from './records-url';

const academyId = '20000000-0000-4000-8000-000000000001';
const courseId = '40000000-0000-4000-8000-000000000001';
const moduleId = '50000000-0000-4000-8000-000000000001';
const lectureId = '60000000-0000-4000-8000-000000000001';
const classId = '80000000-0000-4000-8000-000000000001';

function parse(search: string) {
  return parseRecordsQuery(new URLSearchParams(search));
}

describe('parsing the records URL', () => {
  it('reads a complete state', () => {
    expect(
      parse(
        `q=sum&result=ACCEPTED&result=JUDGE_ERROR&class=${classId}` +
          `&course=${courseId}&module=${moduleId}&lecture=${lectureId}` +
          '&sort=score&direction=asc&page=3',
      ),
    ).toEqual({
      q: 'sum',
      results: ['ACCEPTED', 'JUDGE_ERROR'],
      classIds: [classId],
      courseIds: [courseId],
      moduleIds: [moduleId],
      lectureIds: [lectureId],
      sort: 'score',
      direction: 'asc',
      page: 3,
    });
  });

  it('defaults to newest first on page one', () => {
    expect(parse('')).toEqual(emptyRecordsQuery);
  });

  it('discards unsupported sort keys and malformed directions', () => {
    expect(parse('sort=runtime').sort).toBeNull();
    expect(parse('sort=score&direction=sideways').direction).toBe('asc');
    // A direction with no sort orders nothing, so the default stands.
    expect(parse('direction=asc')).toMatchObject({ sort: null, direction: 'desc' });
  });

  it('discards ids that are not curriculum keys', () => {
    expect(parse('course=all&module=../../etc&lecture=1')).toMatchObject({
      courseIds: [],
      moduleIds: [],
      lectureIds: [],
    });
  });

  it('discards unknown result values and collapses duplicates', () => {
    expect(
      parse('result=ACCEPTED&result=ACCEPTED&result=DEFINITELY_NOT').results,
    ).toEqual(['ACCEPTED']);
  });

  it('discards a non-positive or non-integer page', () => {
    for (const value of ['0', '-4', '1.5', 'two', '']) {
      expect(parse(`page=${value}`).page).toBe(1);
    }
  });
});

describe('serializing the records URL', () => {
  it('omits every default so an untouched table has a bare path', () => {
    expect(serializeRecordsQuery(emptyRecordsQuery)).toBe('');
    expect(recordsPath(academyId, emptyRecordsQuery)).toBe(
      `/academy/${academyId}/learn/records`,
    );
  });

  /** One table state, one address — otherwise `returnTo` is not a key. */
  it('emits parameters in a stable order', () => {
    const query = {
      ...emptyRecordsQuery,
      page: 2,
      sort: 'score' as const,
      direction: 'asc' as const,
      results: ['ACCEPTED' as const],
      q: 'sum',
      courseIds: [courseId],
    };
    expect(serializeRecordsQuery(query)).toBe(
      `q=sum&result=ACCEPTED&course=${courseId}&sort=score&direction=asc&page=2`,
    );
  });

  it('round-trips every state it emits', () => {
    const query = {
      q: 'echo',
      results: ['NOT_ACCEPTED' as const, 'CANCELLED' as const],
      classIds: [classId],
      courseIds: [courseId],
      moduleIds: [moduleId],
      lectureIds: [lectureId],
      sort: 'solveTime' as const,
      direction: 'desc' as const,
      page: 4,
    };
    expect(parse(serializeRecordsQuery(query))).toEqual(query);
  });

  it('drops a direction that no longer describes anything', () => {
    expect(
      serializeRecordsQuery({ ...emptyRecordsQuery, direction: 'asc' }),
    ).toBe('');
  });
});

describe('page reset rules', () => {
  it('returns to page 1 for every query-changing control', () => {
    const current = { ...emptyRecordsQuery, page: 7 };
    for (const change of [
      { q: 'sum' },
      { results: ['ACCEPTED' as const] },
      { classIds: [classId] },
      { courseIds: [courseId] },
      { moduleIds: [moduleId] },
      { lectureIds: [lectureId] },
      { sort: 'score' as const },
      { direction: 'asc' as const },
    ]) {
      expect(withRecordsQueryChange(current, change).page).toBe(1);
    }
  });

  it('keeps the page when only the page changed', () => {
    expect(withRecordsPage(emptyRecordsQuery, 3).page).toBe(3);
    expect(withRecordsPage(emptyRecordsQuery, -2).page).toBe(1);
  });
});

describe('pruning facets a parent no longer allows', () => {
  it('drops selections the server no longer offers', () => {
    const query = {
      ...emptyRecordsQuery,
      courseIds: [courseId],
      moduleIds: [moduleId],
      lectureIds: [lectureId],
      classIds: [classId],
    };

    expect(
      pruneOrphanedFacets(query, {
        classes: [{ value: classId }],
        courses: [{ value: courseId }],
        modules: [],
        lectures: [],
      }),
    ).toMatchObject({
      courseIds: [courseId],
      moduleIds: [],
      lectureIds: [],
      classIds: [classId],
    });
  });
});

describe('validating a return location', () => {
  const root = `/academy/${academyId}/learn/records`;

  it('restores this academy’s own records state', () => {
    expect(safeReturnTo(academyId, encodeURIComponent(`${root}?page=2`))).toBe(
      `${root}?page=2`,
    );
  });

  it('falls back to the records root for anything else', () => {
    for (const candidate of [
      null,
      '',
      'https://evil.example/steal',
      '//evil.example/steal',
      '/academy/other/learn/records',
      `/academy/${academyId}/learn/courses`,
      'javascript:alert(1)',
      '%E0%A4%A',
    ]) {
      expect(safeReturnTo(academyId, candidate)).toBe(root);
    }
  });

  it('normalizes unsupported parameters out of an accepted location', () => {
    expect(
      safeReturnTo(
        academyId,
        encodeURIComponent(`${root}?page=0&sort=runtime&next=/somewhere`),
      ),
    ).toBe(root);
  });
});
