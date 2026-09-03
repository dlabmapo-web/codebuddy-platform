import { describe, expect, it, vi } from 'vitest';

import {
  PlatformRankingService,
  sortRows,
  summarize,
} from './platform-ranking.service.js';
import type { PlatformRankedClass } from '@cove/shared';

const identity = { authUserId: 'operator' } as never;
const seoul = '10000000-0000-4000-8000-000000000001';
const london = '10000000-0000-4000-8000-000000000002';

const input = {
  period: 'day' as const,
  sort: 'points' as const,
  direction: 'desc' as const,
  page: 1,
  pageSize: 25,
};

/**
 * Two academies on two clocks, two classes each.
 *
 * The timezone split is deliberate: it is the one property of this service
 * that cannot be checked by reading a single row, and the failure it guards
 * against — a table that disagrees with the board an operator opens from it —
 * looks correct on every screen.
 */
function createPrisma(
  overrides: {
    flags?: { academyId: string; feature: string }[];
    awards?: {
      classId: string | null;
      membershipId: string;
      _sum: { amount: number | null };
    }[];
    solves?: { classId: string | null; _count: { _all: number } }[];
  } = {},
) {
  const academies = [
    { id: seoul, name: 'D.Lab Mapo', slug: 'mapo', timeZone: 'Asia/Seoul' },
    {
      id: london,
      name: 'Cove London',
      slug: 'london',
      timeZone: 'Europe/London',
    },
  ];
  return {
    academy: {
      findMany: vi.fn(({ select }) =>
        Promise.resolve(
          // `academyOptions` asks without `timeZone`; the scoped read asks with
          // it. One mock serves both by answering the shape requested.
          'timeZone' in select
            ? academies
            : academies.map(({ id, name, slug }) => ({ id, name, slug })),
        ),
      ),
    },
    academyFeatureFlag: {
      findMany: vi.fn().mockResolvedValue(
        overrides.flags ?? [
          { academyId: seoul, feature: 'STUDENT_POINTS' },
          { academyId: seoul, feature: 'STUDENT_CLASS_LEADERBOARD' },
          { academyId: london, feature: 'STUDENT_POINTS' },
          { academyId: london, feature: 'STUDENT_CLASS_LEADERBOARD' },
        ],
      ),
    },
    class: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'class-a',
          name: '3반',
          academyId: seoul,
          assignedTeacher: {
            user: { displayName: 'Kim' },
            memberProfile: { academyDisplayName: '김선생' },
          },
        },
        {
          id: 'class-b',
          name: 'Python A',
          academyId: london,
          assignedTeacher: null,
        },
      ]),
    },
    classEnrollment: {
      groupBy: vi.fn().mockResolvedValue([
        { classId: 'class-a', _count: { _all: 18 } },
        { classId: 'class-b', _count: { _all: 22 } },
      ]),
    },
    pointAward: {
      groupBy: vi.fn(({ by, where }) =>
        Promise.resolve(
          by.includes('membershipId')
            ? (overrides.awards ?? [
                {
                  classId: 'class-a',
                  membershipId: 'm1',
                  _sum: { amount: 40 },
                },
                {
                  classId: 'class-a',
                  membershipId: 'm2',
                  _sum: { amount: 30 },
                },
                // Earned nothing: present in the ledger, but not an earner.
                {
                  classId: 'class-a',
                  membershipId: 'm3',
                  _sum: { amount: 0 },
                },
                {
                  classId: 'class-b',
                  membershipId: 'm4',
                  _sum: { amount: 12 },
                },
              ])
            : (overrides.solves ?? [
                { classId: 'class-a', _count: { _all: 7 } },
                { classId: 'class-b', _count: { _all: 2 } },
              ]),
        ) as never,
      ),
    },
    __where: () => null,
  };
}

function createService(prisma: ReturnType<typeof createPrisma>) {
  return new PlatformRankingService(prisma as never, {
    requirePermission: vi.fn().mockResolvedValue({}),
  } as never);
}

describe('PlatformRankingService.classes', () => {
  it('requires the analytics permission before reading anything', async () => {
    const prisma = createPrisma();
    const access = { requirePermission: vi.fn().mockResolvedValue({}) };
    await new PlatformRankingService(prisma as never, access as never).classes(
      identity,
      input,
    );

    expect(access.requirePermission).toHaveBeenCalledWith(
      'operator',
      'platform.analytics.read',
    );
  });

  it('sums what was paid, and counts only students who earned', async () => {
    const result = await createService(createPrisma()).classes(identity, input);
    const mapo = result.rows.find((row) => row.classId === 'class-a')!;

    expect(mapo.points).toBe(70);
    // Three students have ledger rows in the period; one earned nothing, and a
    // class where one child carries the total must not read like three.
    expect(mapo.earningStudents).toBe(2);
    expect(mapo.students).toBe(18);
    expect(mapo.solvedProblems).toBe(7);
    expect(mapo.state).toBe('ranked');
  });

  it('excludes voided awards from every figure', async () => {
    const prisma = createPrisma();
    await createService(prisma).classes(identity, input);

    for (const call of prisma.pointAward.groupBy.mock.calls) {
      expect(call[0].where.voidedAt).toBeNull();
    }
  });

  it('resolves one period window per distinct clock', async () => {
    const prisma = createPrisma();
    await createService(prisma).classes(identity, input);

    const clauses = prisma.pointAward.groupBy.mock.calls[0][0].where.OR;
    expect(clauses).toHaveLength(2);
    // Seoul's day opens before London's, and the two windows must not be the
    // same instant — that is the whole reason the clause is per academy.
    const [first, second] = clauses;
    expect(first.academyId.in).toEqual([seoul]);
    expect(second.academyId.in).toEqual([london]);
    expect(first.createdAt.gte.getTime()).not.toBe(
      second.createdAt.gte.getTime(),
    );
  });

  it('takes the academy name for a teacher, and null when unassigned', async () => {
    const result = await createService(createPrisma()).classes(identity, input);

    expect(result.rows.find((row) => row.classId === 'class-a')!.teacherName)
      .toBe('김선생');
    expect(result.rows.find((row) => row.classId === 'class-b')!.teacherName)
      .toBeNull();
  });

  it('reports points off as null, never as zero, and keeps the class listed', async () => {
    const prisma = createPrisma({
      flags: [
        { academyId: seoul, feature: 'STUDENT_POINTS' },
        { academyId: seoul, feature: 'STUDENT_CLASS_LEADERBOARD' },
      ],
    });
    const result = await createService(prisma).classes(identity, input);
    const london_ = result.rows.find((row) => row.classId === 'class-b')!;

    expect(london_.state).toBe('points_off');
    expect(london_.points).toBeNull();
    expect(london_.solvedProblems).toBeNull();
    // Still on the table: an academy that switched points off must be
    // findable, or "why is this academy missing" has no answer.
    expect(result.rows).toHaveLength(2);
    expect(result.summary.pointsOffClasses).toBe(1);
  });

  it('keeps real totals when only the named board is off', async () => {
    const prisma = createPrisma({
      flags: [
        { academyId: seoul, feature: 'STUDENT_POINTS' },
        { academyId: london, feature: 'STUDENT_POINTS' },
        { academyId: london, feature: 'STUDENT_CLASS_LEADERBOARD' },
      ],
    });
    const result = await createService(prisma).classes(identity, input);
    const mapo = result.rows.find((row) => row.classId === 'class-a')!;

    expect(mapo.state).toBe('board_off');
    expect(mapo.points).toBe(70);
  });

  it('never asks the aggregate about a class whose academy has points off', async () => {
    const prisma = createPrisma({
      flags: [{ academyId: seoul, feature: 'STUDENT_POINTS' }],
    });
    await createService(prisma).classes(identity, input);

    expect(
      prisma.pointAward.groupBy.mock.calls[0][0].where.classId.in,
    ).toEqual(['class-a']);
  });

  it('summarizes the set it returns', async () => {
    const result = await createService(createPrisma()).classes(identity, input);

    expect(result.summary).toMatchObject({
      academies: 2,
      classes: 2,
      earningClasses: 2,
      students: 40,
      earningStudents: 3,
      points: 82,
    });
  });
});

/* ------------------------------------------------------- ordering and folds */

function row(
  over: Partial<PlatformRankedClass> & { classId: string },
): PlatformRankedClass {
  return {
    academyId: seoul,
    academyName: 'D.Lab Mapo',
    academySlug: 'mapo',
    timeZone: 'Asia/Seoul',
    name: 'Class',
    teacherName: null,
    students: 10,
    earningStudents: 0,
    points: 0,
    solvedProblems: 0,
    state: 'ranked',
    ...over,
  };
}

describe('sortRows', () => {
  it('orders the whole set by points, descending by default', () => {
    const ordered = sortRows(
      [
        row({ classId: 'b', points: 10 }),
        row({ classId: 'c', points: 90 }),
        row({ classId: 'a', points: 50 }),
      ],
      'points',
      'desc',
    );
    expect(ordered.map((one) => one.classId)).toEqual(['c', 'a', 'b']);
  });

  it('breaks ties on class id, so no row lands on two pages', () => {
    // On a daily period most rows tie at zero, which is exactly when an
    // undefined page boundary would show one row twice and drop another.
    const ordered = sortRows(
      [
        row({ classId: 'c', points: 0 }),
        row({ classId: 'a', points: 0 }),
        row({ classId: 'b', points: 0 }),
      ],
      'points',
      'desc',
    );
    expect(ordered.map((one) => one.classId)).toEqual(['a', 'b', 'c']);
  });

  it('sorts a points-off class below zero in both directions', () => {
    const rows = [
      row({ classId: 'off', points: null, state: 'points_off' }),
      row({ classId: 'quiet', points: 0 }),
      row({ classId: 'busy', points: 30 }),
    ];

    expect(sortRows(rows, 'points', 'desc').map((one) => one.classId)).toEqual([
      'busy',
      'quiet',
      'off',
    ]);
    // Ascending, it must not float to the top and read as "worst" — it is not
    // a measurement at all.
    expect(sortRows(rows, 'points', 'asc').map((one) => one.classId)).toEqual([
      'off',
      'quiet',
      'busy',
    ]);
  });

  it('orders by academy name, then by class within it', () => {
    const ordered = sortRows(
      [
        row({ classId: 'a', academyName: 'Zed', name: 'A' }),
        row({ classId: 'b', academyName: 'Ash', name: 'B' }),
        row({ classId: 'c', academyName: 'Ash', name: 'A' }),
      ],
      'academy',
      'asc',
    );
    expect(ordered.map((one) => one.classId)).toEqual(['c', 'b', 'a']);
  });
});

describe('summarize', () => {
  it('counts a class with earners, and treats a null total as nothing earned', () => {
    const summary = summarize(
      [
        row({ classId: 'a', points: 40, earningStudents: 3, students: 18 }),
        row({ classId: 'b', points: 0, earningStudents: 0, students: 12 }),
        row({
          classId: 'c',
          points: null,
          state: 'points_off',
          students: 9,
        }),
      ],
      2,
    );

    expect(summary).toEqual({
      academies: 2,
      classes: 3,
      earningClasses: 1,
      students: 39,
      earningStudents: 3,
      points: 40,
      pointsOffClasses: 1,
    });
  });
});
