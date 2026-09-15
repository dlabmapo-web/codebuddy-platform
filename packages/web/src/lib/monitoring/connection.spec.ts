import { describe, expect, it } from 'vitest';

import {
  canActLive,
  isExpectedWatchReplacement,
  monitoringRevocationApplies,
  canEditSynchronizedDraft,
  monitoringSocketUrl,
  nextConnectionState,
  type MonitoringConnectionState,
} from './connection';

describe('monitoringSocketUrl', () => {
  it('derives the namespace from the configured API origin', () => {
    expect(monitoringSocketUrl('http://localhost:4000/api/rpc')).toBe(
      'http://localhost:4000/monitoring',
    );
  });

  it('keeps the scheme and port of a deployed API', () => {
    expect(monitoringSocketUrl('https://api.cove.test:8443/api/rpc')).toBe(
      'https://api.cove.test:8443/monitoring',
    );
  });
});

describe('nextConnectionState', () => {
  it('does not call a fresh connection live until it has synchronized', () => {
    expect(nextConnectionState('connecting', { type: 'connect' })).toBe(
      'resynchronizing',
    );
    expect(nextConnectionState('resynchronizing', { type: 'synchronized' })).toBe(
      'live',
    );
  });

  it('trusts a recovered session, which kept its rooms and packets', () => {
    expect(nextConnectionState('reconnecting', { type: 'recovered' })).toBe(
      'live',
    );
  });

  it('resynchronizes when recovery failed', () => {
    expect(
      nextConnectionState('reconnecting', { type: 'recovery_failed' }),
    ).toBe('resynchronizing');
  });

  it('shows a dropped transport as reconnecting, not offline', () => {
    expect(nextConnectionState('live', { type: 'disconnect' })).toBe(
      'reconnecting',
    );
  });

  it('reports an unavailable service as degraded rather than as an empty class', () => {
    expect(nextConnectionState('live', { type: 'degraded' })).toBe('degraded');
  });

  it('never leaves the revoked state, however the socket behaves afterwards', () => {
    const events = ['connect', 'recovered', 'synchronized', 'disconnect'] as const;
    for (const type of events) {
      expect(nextConnectionState('revoked', { type })).toBe('revoked');
    }
  });

  it('keeps a live connection live across a reconnect it did not notice', () => {
    expect(nextConnectionState('live', { type: 'connect' })).toBe('live');
  });
});

describe('canActLive', () => {
  it('allows edits and feedback only on a confirmed live session', () => {
    const states: MonitoringConnectionState[] = [
      'connecting',
      'reconnecting',
      'resynchronizing',
      'degraded',
      'revoked',
    ];
    for (const state of states) expect(canActLive(state)).toBe(false);
    expect(canActLive('live')).toBe(true);
  });
});

describe('canEditSynchronizedDraft', () => {
  it('locks a newly followed draft until that exact document is synchronized', () => {
    expect(
      canEditSynchronizedDraft({
        state: 'live',
        sessionDraftId: 'draft-new',
        syncedDraftId: 'draft-old',
        ended: false,
      }),
    ).toBe(false);
    expect(
      canEditSynchronizedDraft({
        state: 'live',
        sessionDraftId: 'draft-new',
        syncedDraftId: 'draft-new',
        ended: false,
      }),
    ).toBe(true);
  });

  it('keeps synchronized documents locked after the watch ends', () => {
    expect(
      canEditSynchronizedDraft({
        state: 'live',
        sessionDraftId: 'draft-1',
        syncedDraftId: 'draft-1',
        ended: true,
      }),
    ).toBe(false);
  });
});


describe('scoped monitoring revocation', () => {
  it('preserves student presence revocation without a teacher scope', () => {
    expect(monitoringRevocationApplies(undefined, { classId: 'class', studentMembershipId: 'student' })).toBe(true);
  });
  it('does not revoke a whole roster when one student is removed', () => {
    expect(monitoringRevocationApplies({ classId: 'class' }, { classId: 'class', studentMembershipId: 'student' })).toBe(false);
  });
  it('revokes the matching watch and leaves another student watch alone', () => {
    const scope = { classId: 'class', studentMembershipId: 'a' };
    expect(monitoringRevocationApplies(scope, { classId: 'class', studentMembershipId: 'a' })).toBe(true);
    expect(monitoringRevocationApplies(scope, { classId: 'class', studentMembershipId: 'b' })).toBe(false);
  });
  it('keeps whole-class revocation terminal only for that class', () => {
    expect(monitoringRevocationApplies({ classId: 'class' }, { classId: 'class' })).toBe(true);
    expect(monitoringRevocationApplies({ classId: 'other' }, { classId: 'class' })).toBe(false);
  });
});


describe('expected watch retirement', () => {
  it('keeps a requested successor alive when its exact predecessor ends', () => {
    expect(isExpectedWatchReplacement({ visitId: 'old', reason: 'WATCH_REPLACED' }, 'old')).toBe(true);
  });
  it('never suppresses revocation, another visit, or an unrequested replacement', () => {
    expect(isExpectedWatchReplacement({ visitId: 'old', reason: 'ENROLLMENT_REMOVED' }, 'old')).toBe(false);
    expect(isExpectedWatchReplacement({ visitId: 'other', reason: 'WATCH_REPLACED' }, 'old')).toBe(false);
    expect(isExpectedWatchReplacement({ visitId: 'old', reason: 'WATCH_REPLACED' }, null)).toBe(false);
    expect(isExpectedWatchReplacement({ reason: 'WATCH_REPLACED' }, 'old')).toBe(false);
  });
});
