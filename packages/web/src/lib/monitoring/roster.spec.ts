import type {
  MonitoringLiveState,
  MonitoringRosterStudent,
  PresenceEntry,
} from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  compareLiveState,
  countRoster,
  matchesFilter,
  mergeRoster,
  sortRoster,
  studentSearchText,
  type RosterFilter,
} from './roster';

const materialId = '80000000-0000-4000-8000-000000000001';

function student(
  overrides: Partial<MonitoringRosterStudent> & { membershipId: string },
): MonitoringRosterStudent {
  return {
    userId: `user-${overrides.membershipId}`,
    displayName: 'Student',
    username: 'student01',
    email: 'student@example.com',
    membershipStatus: 'ACTIVE',
    userStatus: 'ACTIVE',
    enrolledAt: '2026-08-04T09:00:00.000Z',
    lastLearningSeenAt: null,
    ...overrides,
  };
}

function presence(
  membershipId: string,
  overrides: Partial<PresenceEntry> = {},
): PresenceEntry {
  return {
    studentMembershipId: membershipId,
    state: 'SOLVING',
    materialId,
    courseId: null,
    lastActivityAt: null,
    stateExpiresAt: null,
    run: null,
    latestSubmissionId: null,
    ...overrides,
  };
}

describe('mergeRoster', () => {
  it('shows an enrolled student with no presence as offline', () => {
    const [row] = mergeRoster([student({ membershipId: 'a' })], []);
    expect(row!.state).toBe('OFFLINE');
    expect(row!.canOpenLive).toBe(false);
  });

  it('decorates a row with the presence the room reported', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'IDLE' })],
    );
    expect(row!.state).toBe('IDLE');
    expect(row!.materialId).toBe(materialId);
  });

  it('opens a student who is solving', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'SOLVING', materialId })],
    );
    expect(row).toMatchObject({
      state: 'SOLVING',
      materialId,
      canOpenLive: true,
    });
  });

  /**
   * Both hold an exercise, and neither has anything live in it: Idle has done
   * nothing for a minute, and Online's workspace is behind another window.
   */
  it('does not open a student who holds an exercise but is not working', () => {
    const [idle] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'IDLE', materialId })],
    );
    const [online] = mergeRoster(
      [student({ membershipId: 'b' })],
      [presence('b', { state: 'ONLINE', materialId })],
    );
    expect(idle!.canOpenLive).toBe(false);
    expect(online!.canOpenLive).toBe(false);
  });

  it('ignores presence for somebody who is not on the roster', () => {
    const rows = mergeRoster([student({ membershipId: 'a' })], [presence('b')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('OFFLINE');
  });

  it('never opens a student who is not inside an exercise', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'ONLINE', materialId: null })],
    );
    expect(row!.canOpenLive).toBe(false);
  });

  it('keeps a suspended enrollment visible but never openable', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a', membershipStatus: 'SUSPENDED' })],
      [presence('a')],
    );
    expect(row!.active).toBe(false);
    expect(row!.canOpenLive).toBe(false);
  });

  it('treats a suspended user behind an active membership the same way', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a', userStatus: 'SUSPENDED' })],
      [presence('a')],
    );
    expect(row!.canOpenLive).toBe(false);
  });
});

describe('matchesFilter', () => {
  const rows = mergeRoster(
    [
      student({ membershipId: 'a', displayName: 'Ada' }),
      student({ membershipId: 'b', displayName: 'Bo', email: 'bo@school.test' }),
      student({ membershipId: 'c', displayName: 'Cy' }),
    ],
    [
      presence('a', { state: 'SOLVING' }),
      presence('b', { state: 'IDLE' }),
    ],
  );

  function count(filter: RosterFilter): number {
    return rows.filter((row) => matchesFilter(row, filter)).length;
  }

  it('counts every live connection as online, not only solving', () => {
    expect(count('online')).toBe(2);
  });

  /**
   * Three signed in, two of them solving: Online lists all three and Solving
   * lists two. The narrowed Open live rule must never leak into the filter —
   * a student who is working is still a student who is here.
   */
  it('keeps a solving student in the online list', () => {
    const signedIn = mergeRoster(
      [
        student({ membershipId: 'a', displayName: 'Ada' }),
        student({ membershipId: 'b', displayName: 'Bo' }),
        student({ membershipId: 'c', displayName: 'Cy' }),
      ],
      [
        presence('a', { state: 'SOLVING' }),
        presence('b', { state: 'SOLVING' }),
        presence('c', { state: 'ONLINE', materialId: null }),
      ],
    );
    expect(signedIn.filter((row) => matchesFilter(row, 'online'))).toHaveLength(3);
    expect(signedIn.filter((row) => matchesFilter(row, 'solving'))).toHaveLength(2);
  });

  /** Online with no exercise is the ordinary state of a signed-in student. */
  it('never offers to open a student who has no exercise', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'ONLINE', materialId: null })],
    );
    expect(row!.canOpenLive).toBe(false);
  });

  it.each([
    ['solving', 1],
    ['idle', 1],
    ['offline', 1],
    ['all', 3],
  ] as Array<[RosterFilter, number]>)('filters %s', (filter, expected) => {
    expect(count(filter)).toBe(expected);
  });
});

describe('studentSearchText', () => {
  it('covers all three identifiers a teacher might type', () => {
    const [row] = mergeRoster(
      [
        student({
          membershipId: 'a',
          displayName: 'Ada',
          username: 'ada01',
          email: 'ada@school.test',
        }),
      ],
      [],
    );
    expect(studentSearchText(row!)).toBe('Ada ada01 ada@school.test');
  });

  /** An OAuth account has no username, and must stay findable by name. */
  it('drops the blanks rather than joining them', () => {
    const [row] = mergeRoster(
      [
        student({
          membershipId: 'a',
          displayName: 'Ada',
          username: null,
          email: null,
        }),
      ],
      [],
    );
    expect(studentSearchText(row!)).toBe('Ada');
  });
});

describe('compareLiveState', () => {
  /**
   * The table's State column sorts through this. Alphabetical order would put
   * IDLE above SOLVING and scatter the students the default order gathers.
   */
  it('orders by who needs attention, not by the enum spelling', () => {
    const states: MonitoringLiveState[] = [
      'OFFLINE',
      'ONLINE',
      'RECONNECTING',
      'IDLE',
      'SOLVING',
    ];
    expect([...states].sort(compareLiveState)).toEqual([
      'SOLVING',
      'IDLE',
      'ONLINE',
      'RECONNECTING',
      'OFFLINE',
    ]);
  });
});

describe('countRoster', () => {
  it('counts from the rendered rows so a card cannot contradict the list', () => {
    const rows = mergeRoster(
      [
        student({ membershipId: 'a' }),
        student({ membershipId: 'b' }),
        student({ membershipId: 'c' }),
      ],
      [presence('a'), presence('b', { state: 'ONLINE' })],
    );
    expect(countRoster(rows)).toEqual({ total: 3, online: 2, solving: 1 });
  });
});

describe('sortRoster', () => {
  it('puts the students who need attention first', () => {
    const rows = mergeRoster(
      [
        student({ membershipId: 'a', displayName: 'Ada' }),
        student({ membershipId: 'b', displayName: 'Bo' }),
        student({ membershipId: 'c', displayName: 'Cy' }),
      ],
      [
        presence('c', { state: 'SOLVING' }),
        presence('b', { state: 'ONLINE' }),
      ],
    );
    expect(sortRoster(rows).map((row) => row.displayName)).toEqual([
      'Cy',
      'Bo',
      'Ada',
    ]);
  });

  it('breaks ties by name rather than by arrival order', () => {
    const rows = mergeRoster(
      [
        student({ membershipId: 'b', displayName: 'Bo' }),
        student({ membershipId: 'a', displayName: 'Ada' }),
      ],
      [],
    );
    expect(sortRoster(rows).map((row) => row.displayName)).toEqual(['Ada', 'Bo']);
  });
});
