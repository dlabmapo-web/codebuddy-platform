import { describe, expect, it } from 'vitest';

import {
  coursesForClass,
  defaultOverviewQuery,
  overviewPath,
  parseOverviewQuery,
  serializeOverviewQuery,
  solutionStatusPath,
  studentAnalyticsPath,
  withClassSelection,
} from './overview-url';

const academyId = '20000000-0000-4000-8000-000000000001';
const classA = '30000000-0000-4000-8000-000000000001';
const classB = '30000000-0000-4000-8000-000000000002';
const courseOne = '40000000-0000-4000-8000-000000000001';
const courseTwo = '40000000-0000-4000-8000-000000000002';
const membershipId = '80000000-0000-4000-8000-000000000001';
const materialId = '70000000-0000-4000-8000-000000000001';

const courses = [
  { value: courseOne, classIds: [classA, classB] },
  { value: courseTwo, classIds: [classB] },
];

describe('parseOverviewQuery', () => {
  it('defaults to every class and seven days', () => {
    expect(parseOverviewQuery('')).toEqual(defaultOverviewQuery);
  });

  it('reads a full state back', () => {
    expect(
      parseOverviewQuery(`class=${classA}&course=${courseOne}&range=30d`),
    ).toEqual({
      classId: classA,
      courseId: courseOne,
      range: '30d',
    });
  });

  it('drops the superseded participation lens during canonicalization', () => {
    // §5.3 — the redesigned overview has one required participation view, so
    // the parameter selects nothing and must not survive into the address.
    const parsed = parseOverviewQuery(`range=30d&participation=work`);
    expect(parsed).toEqual({ ...defaultOverviewQuery, range: '30d' });
    expect(serializeOverviewQuery(parsed)).toBe('range=30d');
  });

  it('treats the written "all" and an absent parameter as one state', () => {
    expect(parseOverviewQuery('class=all&course=all')).toEqual(
      defaultOverviewQuery,
    );
  });

  it('drops values that are not ids or not supported', () => {
    expect(
      parseOverviewQuery('class=../../etc/passwd&course=1&range=90d'),
    ).toEqual(defaultOverviewQuery);
  });

  it('accepts a record of search params from the server', () => {
    expect(
      parseOverviewQuery({ range: '30d', class: classB, unknown: 'x' }),
    ).toMatchObject({ range: '30d', classId: classB });
  });
});

describe('serializeOverviewQuery', () => {
  it('leaves defaults out of the address', () => {
    expect(serializeOverviewQuery(defaultOverviewQuery)).toBe('');
    expect(overviewPath(academyId, defaultOverviewQuery)).toBe(
      `/academy/${academyId}`,
    );
  });

  it('round-trips a non-default state in one canonical order', () => {
    const query = {
      classId: classA,
      courseId: courseOne,
      range: 'all' as const,
    };
    const serialized = serializeOverviewQuery(query);
    expect(serialized).toBe(
      `class=${classA}&course=${courseOne}&range=all`,
    );
    expect(parseOverviewQuery(serialized)).toEqual(query);
  });
});

describe('dependent filters', () => {
  it('clears a course the newly selected class does not teach', () => {
    const current = {
      ...defaultOverviewQuery,
      classId: classB,
      courseId: courseTwo,
    };
    expect(withClassSelection(current, classA, courses).courseId).toBeNull();
  });

  it('keeps a course both classes teach', () => {
    const current = {
      ...defaultOverviewQuery,
      classId: classB,
      courseId: courseOne,
    };
    expect(withClassSelection(current, classA, courses).courseId).toBe(
      courseOne,
    );
  });

  it('keeps any course when the class filter is cleared', () => {
    const current = {
      ...defaultOverviewQuery,
      classId: classB,
      courseId: courseTwo,
    };
    expect(withClassSelection(current, null, courses).courseId).toBe(courseTwo);
  });

  it('offers only the courses the selected class teaches', () => {
    expect(coursesForClass(courses, classA)).toEqual([courses[0]]);
    expect(coursesForClass(courses, null)).toEqual(courses);
  });
});

describe('solutionStatusPath', () => {
  it('opens one student in the By-student lens', () => {
    expect(
      solutionStatusPath({ academySlug: academyId, classId: classA, membershipId }),
    ).toBe(
      `/academy/${academyId}/teach/classes/${classA}/progress` +
        `?student=${membershipId}`,
    );
  });

  it('opens one problem in the By-problem lens', () => {
    expect(
      solutionStatusPath({
        academySlug: academyId,
        classId: classA,
        view: 'problems',
        courseId: courseOne,
        materialId,
      }),
    ).toBe(
      `/academy/${academyId}/teach/classes/${classA}/progress` +
        `?view=problems&course=${courseOne}&problem=${materialId}`,
    );
  });

  it('carries an attention filter through', () => {
    expect(
      solutionStatusPath({
        academySlug: academyId,
        classId: classA,
        attention: 'repeated_failures',
      }),
    ).toContain('attention=repeated_failures');
  });

  it('has nowhere authorized to send an academy-wide signal', () => {
    // Solution status is class-scoped, so a signal without a class renders no
    // action rather than a link that would land on a page nobody can open.
    expect(solutionStatusPath({ academySlug: academyId, classId: null })).toBeNull();
  });
});

describe('studentAnalyticsPath', () => {
  it('carries the overview scope into the detail page', () => {
    // §5.1 — a preview and its "view all" must describe the same class. A link
    // that reset the filters would open on a different set of students.
    expect(
      studentAnalyticsPath({
        academySlug: academyId,
        query: { classId: classA, courseId: courseOne, range: '30d' },
        sort: 'score',
      }),
    ).toBe(
      `/academy/${academyId}/teach/students` +
        `?class=${classA}&course=${courseOne}&range=30d&sort=score`,
    );
  });

  it('leaves the default period out of the address', () => {
    expect(
      studentAnalyticsPath({ academySlug: academyId, query: defaultOverviewQuery }),
    ).toBe(`/academy/${academyId}/teach/students`);
  });

  it('encodes which end of the activity list was on screen', () => {
    // §6.7 — "least active" must not open a page showing the most active.
    expect(
      studentAnalyticsPath({
        academySlug: academyId,
        query: defaultOverviewQuery,
        sort: 'activeTime',
        direction: 'asc',
      }),
    ).toContain('sort=activeTime&direction=asc');
  });
});
