import { describe, expect, it } from 'vitest';

import {
  encodeViewRole,
  parseViewRole,
  resolveViewRole,
} from './academy-view-role';

const academyId = '11111111-2222-4333-8444-555555555555';
const other = '99999999-2222-4333-8444-555555555555';

describe('view role cookie', () => {
  it('round-trips', () => {
    expect(parseViewRole(encodeViewRole(academyId, 'TEACHER'))).toEqual({
      academyId,
      role: 'TEACHER',
    });
  });

  it('reads nothing from a malformed value', () => {
    expect(parseViewRole(undefined)).toBeNull();
    expect(parseViewRole('')).toBeNull();
    expect(parseViewRole('TEACHER')).toBeNull();
    expect(parseViewRole(':TEACHER')).toBeNull();
  });
});

describe('resolveViewRole', () => {
  const held = ['TEACHER', 'MANAGER'] as const;

  it('uses the remembered role when the member still holds it', () => {
    expect(
      resolveViewRole({
        academyId,
        held,
        primary: 'MANAGER',
        cookie: encodeViewRole(academyId, 'TEACHER'),
      }),
    ).toEqual({ role: 'TEACHER', stale: false });
  });

  it('falls back to the primary role and marks the cookie stale when the role was revoked', () => {
    expect(
      resolveViewRole({
        academyId,
        held: ['MANAGER'],
        primary: 'MANAGER',
        cookie: encodeViewRole(academyId, 'TEACHER'),
      }),
    ).toEqual({ role: 'MANAGER', stale: true });
  });

  it('ignores a hand-edited role', () => {
    expect(
      resolveViewRole({
        academyId,
        held,
        primary: 'MANAGER',
        cookie: `${academyId}:ADMIN`,
      }).role,
    ).toBe('MANAGER');
  });

  it('leaves another academy alone', () => {
    // Not stale: a cookie for a different academy is a correct cookie about a
    // different page, and rewriting it here would lose that choice over there.
    expect(
      resolveViewRole({
        academyId,
        held,
        primary: 'MANAGER',
        cookie: encodeViewRole(other, 'TEACHER'),
      }),
    ).toEqual({ role: 'MANAGER', stale: false });
  });

  it('resolves to the only role a single-role member has', () => {
    expect(
      resolveViewRole({
        academyId,
        held: ['STUDENT'],
        primary: 'STUDENT',
        cookie: undefined,
      }),
    ).toEqual({ role: 'STUDENT', stale: false });
  });
});
