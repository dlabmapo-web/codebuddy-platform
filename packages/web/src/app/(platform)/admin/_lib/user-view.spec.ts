import type { PlatformUserMembership, PlatformUserSummary } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  affiliationOf,
  accountStatusTone,
  operatorPlateStyles,
  orderMemberships,
  roleChipStyles,
  statusToneStyles,
  userDisplayName,
} from './user-view';

function membership(
  overrides: Partial<PlatformUserMembership> = {},
): PlatformUserMembership {
  return {
    membershipId: '33333333-3333-4333-8333-333333333333',
    academyId: '11111111-1111-4111-8111-111111111111',
    academySlug: 'dlab-mapo',
    academyName: 'DLab Mapo',
    role: 'STUDENT',
    status: 'ACTIVE',
    joinedAt: null,
    ...overrides,
  };
}

function user(
  overrides: Partial<PlatformUserSummary> = {},
): PlatformUserSummary {
  return {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Kim Minji',
    username: 'minji',
    email: 'minji@example.com',
    avatarUrl: null,
    status: 'ACTIVE',
    platformRole: 'USER',
    createdAt: '2026-08-01T00:00:00.000Z',
    memberships: [],
    ...overrides,
  };
}

describe('membership ordering', () => {
  it('puts an active membership ahead of a suspended one', () => {
    const ordered = orderMemberships([
      membership({ role: 'MANAGER', status: 'SUSPENDED' }),
      membership({ role: 'STUDENT', status: 'ACTIVE', academyName: 'B' }),
    ]);
    expect(ordered[0]!.status).toBe('ACTIVE');
  });

  it('leads with the most senior active role', () => {
    const ordered = orderMemberships([
      membership({ role: 'STUDENT', academyName: 'A' }),
      membership({ role: 'MANAGER', academyName: 'B' }),
      membership({ role: 'TEACHER', academyName: 'C' }),
    ]);
    expect(ordered.map((entry) => entry.role)).toEqual([
      'MANAGER',
      'TEACHER',
      'STUDENT',
    ]);
  });

  it('orders equal roles by academy name so the list is stable', () => {
    const ordered = orderMemberships([
      membership({ academyName: 'Songpa', academyId: 'b' }),
      membership({ academyName: 'Gangnam', academyId: 'a' }),
    ]);
    expect(ordered.map((entry) => entry.academyName)).toEqual([
      'Gangnam',
      'Songpa',
    ]);
  });

  it('does not mutate what it was given', () => {
    const input = [
      membership({ role: 'STUDENT' }),
      membership({ role: 'MANAGER' }),
    ];
    orderMemberships(input);
    expect(input[0]!.role).toBe('STUDENT');
  });
});

describe('affiliation cell', () => {
  it('reports no academy for an unaffiliated account', () => {
    expect(affiliationOf(user())).toEqual({ lead: null, others: 0 });
  });

  it('shows one membership and no overflow for the ordinary case', () => {
    const result = affiliationOf(user({ memberships: [membership()] }));
    expect(result.lead?.academyName).toBe('DLab Mapo');
    expect(result.others).toBe(0);
  });

  it('counts the rest rather than listing them', () => {
    const result = affiliationOf(
      user({
        memberships: [
          membership({ role: 'STUDENT', academyName: 'A', academyId: 'a' }),
          membership({ role: 'MANAGER', academyName: 'B', academyId: 'b' }),
          membership({ role: 'TEACHER', academyName: 'C', academyId: 'c' }),
        ],
      }),
    );
    expect(result.lead?.role).toBe('MANAGER');
    expect(result.others).toBe(2);
  });
});

describe('user naming', () => {
  it('prefers the account name, then the handle, then the email', () => {
    expect(userDisplayName(user())).toBe('Kim Minji');
    expect(userDisplayName(user({ displayName: null }))).toBe('minji');
    expect(
      userDisplayName(user({ displayName: null, username: null })),
    ).toBe('minji@example.com');
  });

  it('marks an account with no name at all rather than printing nothing', () => {
    // A blank cell reads as a broken row; this is a real state an account
    // occupies between accepting an invitation and finishing its profile.
    expect(
      userDisplayName({ displayName: null, username: null, email: null }),
    ).toBe('—');
  });

  it('ignores whitespace-only names', () => {
    expect(userDisplayName(user({ displayName: '   ' }))).toBe('minji');
  });
});

describe('account status tone', () => {
  it('gives every state its own colour', () => {
    // Four states, four tones, no two alike: the column is read first by an
    // operator who opened this page because somebody cannot sign in, so each
    // answer has to be distinguishable at a glance rather than by reading.
    expect(accountStatusTone.ACTIVE).toBe('settled');
    expect(accountStatusTone.PENDING_PROFILE).toBe('warning');
    expect(accountStatusTone.SUSPENDED).toBe('danger');
    expect(accountStatusTone.DELETED).toBe('retired');
    expect(new Set(Object.values(accountStatusTone)).size).toBe(4);
  });

  it('never lets a status borrow a role hue', () => {
    // The one rule that did not change: hue names what a person *is*, and a
    // status must not be mistakable for a role.
    const roleChips = (['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER'] as const).map(
      (role) => roleChipStyles(role).className,
    );
    for (const tone of Object.values(accountStatusTone)) {
      expect(roleChips, tone).not.toContain(statusToneStyles[tone]);
    }
  });
});

/**
 * The role chip's palette, checked against the role list rather than against
 * itself.
 */
describe('role presentation', () => {
  it('gives every academy role an icon and a tone', () => {
    for (const role of ['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER'] as const) {
      const chip = roleChipStyles(role);
      expect(chip.icon, role).toBeDefined();
      expect(chip.className, role).toBeTruthy();
    }
  });

  it('keeps operators out of the four academy-role hues', () => {
    // §3.3 — platform authority reads as weight, not as a fifth hue. If this
    // ever equals one of the role tones, an operator and a manager become the
    // same colour in the table.
    const roleTones = (['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER'] as const).map(
      (role) => roleChipStyles(role).className,
    );
    expect(roleTones).not.toContain(operatorPlateStyles);
    expect(new Set(roleTones).size).toBe(4);
  });
});
