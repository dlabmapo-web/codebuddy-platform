import type { ProfileMembership } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { myPagePath, selectAcademy } from './academy-selection';

function membership(
  overrides: Partial<ProfileMembership> & { academyId: string },
): ProfileMembership {
  return {
    membershipId: `m-${overrides.academyId}`,
    academyName: overrides.academyId,
    academySlug: overrides.academyId,
    role: 'STUDENT',
    status: 'ACTIVE',
    joinedAt: null,
    ...overrides,
  };
}

const mapo = membership({ academyId: 'mapo' });
const gangnam = membership({ academyId: 'gangnam', role: 'TEACHER' });
const left = membership({ academyId: 'old', status: 'LEFT' });

describe('selectAcademy', () => {
  it('honours an academy the caller is actively a member of', () => {
    const result = selectAcademy([mapo, gangnam], 'gangnam');
    expect(result.selected).toBe(gangnam);
    expect(result.shouldReplaceUrl).toBe(false);
  });

  // A stale bookmark is the most likely way to arrive with a bad value, and
  // losing the whole page over it would be absurd.
  it('drops an unauthorized value and falls back without erroring', () => {
    const result = selectAcademy([mapo], 'somewhere-else');
    expect(result.selected).toBe(mapo);
    expect(result.shouldReplaceUrl).toBe(true);
  });

  it('never selects a membership that is not active', () => {
    const result = selectAcademy([left, mapo], 'old');
    expect(result.options).toEqual([mapo]);
    expect(result.selected).toBe(mapo);
    expect(result.shouldReplaceUrl).toBe(true);
  });

  it('prefers the remembered academy when the URL says nothing', () => {
    const result = selectAcademy([mapo, gangnam], null, 'gangnam');
    expect(result.selected).toBe(gangnam);
    expect(result.shouldReplaceUrl).toBe(false);
  });

  it('falls to the first active membership when nothing else applies', () => {
    expect(selectAcademy([mapo, gangnam], null, 'old').selected).toBe(mapo);
  });

  // An account can exist before any academy accepts it, and it still has a
  // name, a password, and a language.
  it('returns no selection for an account with no active membership', () => {
    const result = selectAcademy([left], null);
    expect(result.selected).toBeNull();
    expect(result.options).toEqual([]);
  });
});

describe('myPagePath', () => {
  it('carries the academy and omits it when there is none', () => {
    expect(myPagePath('mapo')).toBe('/account?academy=mapo');
    expect(myPagePath(null)).toBe('/account');
  });
});
