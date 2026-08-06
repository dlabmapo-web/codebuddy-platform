import type { MonitoringRosterStudent, PresenceEntry } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  countRoster,
  filterRoster,
  mergeRoster,
  sortRoster,
  type RosterFilter,
} from './roster';

const materialId = '80000000-0000-4000-8000-000000000001';

function student(
  overrides: Partial<MonitoringRosterStudent> & { membershipId: string },
): MonitoringRosterStudent {
  return {
    userId: `user-${overrides.membershipId}`,
    displayName: 'Student',
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
    expect(row!.canOpenLive).toBe(true);
  });

  it('opens an online student whose current exercise was verified', () => {
    const [row] = mergeRoster(
      [student({ membershipId: 'a' })],
      [presence('a', { state: 'ONLINE', materialId })],
    );
    expect(row).toMatchObject({
      state: 'ONLINE',
      materialId,
      canOpenLive: true,
    });
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

describe('filterRoster', () => {
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

  it('counts every live connection as online, not only solving', () => {
    expect(filterRoster(rows, { filter: 'online', search: '' })).toHaveLength(2);
  });

  it.each([
    ['solving', 1],
    ['idle', 1],
    ['offline', 1],
    ['all', 3],
  ] as Array<[RosterFilter, number]>)('filters %s', (filter, expected) => {
    expect(filterRoster(rows, { filter, search: '' })).toHaveLength(expected);
  });

  it('searches name and email, case-insensitively', () => {
    expect(filterRoster(rows, { filter: 'all', search: 'ADA' })).toHaveLength(1);
    expect(
      filterRoster(rows, { filter: 'all', search: 'bo@school' }),
    ).toHaveLength(1);
  });

  it('ignores surrounding whitespace in the search box', () => {
    expect(filterRoster(rows, { filter: 'all', search: '  ' })).toHaveLength(3);
  });

  it('applies the filter and the search together', () => {
    expect(
      filterRoster(rows, { filter: 'solving', search: 'Bo' }),
    ).toHaveLength(0);
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
