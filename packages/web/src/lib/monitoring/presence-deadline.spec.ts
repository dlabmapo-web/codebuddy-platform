import type { PresenceEntry } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { nextPresenceDeadline } from './presence-deadline';

const entry = (stateExpiresAt: string | null): PresenceEntry => ({
  studentMembershipId: '40000000-0000-4000-8000-000000000005',
  state: stateExpiresAt ? 'RECONNECTING' : 'SOLVING',
  materialId: 'e0000000-0000-4000-8000-000000000031',
  courseId: 'e0000000-0000-4000-8000-000000000001',
  lastActivityAt: '2026-08-06T05:41:21.153Z',
  stateExpiresAt,
  run: null,
  latestSubmissionId: null,
});

describe('nextPresenceDeadline', () => {
  it('returns the earliest server-authored expiry', () => {
    expect(
      nextPresenceDeadline([
        entry('2026-08-06T05:42:00.000Z'),
        entry('2026-08-06T05:41:30.000Z'),
      ]),
    ).toBe(Date.parse('2026-08-06T05:41:30.000Z'));
  });

  it('returns null when every current state is stable', () => {
    expect(nextPresenceDeadline([entry(null)])).toBeNull();
  });
});
