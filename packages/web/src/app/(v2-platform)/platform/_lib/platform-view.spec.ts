import { describe, expect, it } from 'vitest';

import { academyCondition, inRollCall, stakesParts } from './platform-view';

const counts = {
  total: 0,
  managers: 0,
  teamLeads: 0,
  teachers: 0,
  students: 0,
};

function academy(overrides: Partial<Parameters<typeof inRollCall>[0]> = {}) {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'DLab Gangnam',
    slug: 'dlab-gangnam',
    status: 'ACTIVE' as const,
    timeZone: 'Asia/Seoul',
    managerState: 'active' as const,
    memberCounts: counts,
    pendingManagerInvitation: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    statusChangedAt: null,
    ...overrides,
  };
}

describe('academyCondition', () => {
  it('reads a healthy academy as running', () => {
    expect(academyCondition(academy())).toBe('running');
  });

  it('ranks a leaderless academy above a suspended one', () => {
    // Suspension was a decision somebody made. This was not.
    expect(
      academyCondition(
        academy({ status: 'SUSPENDED', managerState: 'no_active_manager' }),
      ),
    ).toBe('no_active_manager');
  });

  it('lets archived outrank everything', () => {
    expect(
      academyCondition(
        academy({ status: 'ARCHIVED', managerState: 'no_active_manager' }),
      ),
    ).toBe('archived');
  });
});

describe('inRollCall', () => {
  it('keeps healthy and archived academies out of the roll call', () => {
    expect(inRollCall(academy())).toBe(false);
    expect(inRollCall(academy({ status: 'ARCHIVED' }))).toBe(false);
  });

  it('calls up everything that has stalled', () => {
    expect(inRollCall(academy({ managerState: 'no_active_manager' }))).toBe(true);
    expect(inRollCall(academy({ managerState: 'awaiting_first_manager' })))
      .toBe(true);
    expect(inRollCall(academy({ status: 'SUSPENDED' }))).toBe(true);
  });
});

describe('stakesParts', () => {
  it('omits roles nobody holds', () => {
    expect(stakesParts({ ...counts, students: 340, teachers: 12 })).toEqual([
      { key: 'students', count: 340 },
      { key: 'teachers', count: 12 },
    ]);
  });

  it('leads with the people who are most stranded', () => {
    const parts = stakesParts({
      total: 4,
      managers: 1,
      teamLeads: 1,
      teachers: 1,
      students: 1,
    });
    expect(parts.map((part) => part.key)).toEqual([
      'students',
      'teachers',
      'team_leads',
    ]);
  });

  it('says nothing when the academy is empty', () => {
    expect(stakesParts(counts)).toEqual([]);
  });
});
