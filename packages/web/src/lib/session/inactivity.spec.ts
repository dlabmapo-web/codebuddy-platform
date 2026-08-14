import { describe, expect, it } from 'vitest';

import {
  INACTIVITY_LIMIT_MS,
  countdown,
  inactivityPhase,
  laterDeadline,
  nextDeadline,
  remainingMs,
  safeReturnPath,
  shouldAnnounce,
  shouldSyncStudentSession,
} from './inactivity';

/**
 * The boundaries §14.1 names, and the ones that fail silently.
 *
 * A countdown that is one tick late, a phase that never reaches `critical`, or
 * a cross-tab reconciliation that takes the earlier deadline all look correct
 * in a browser and sign a child out mid-sentence in a classroom.
 */

const minutes = (value: number) => value * 60_000;

describe('inactivityPhase', () => {
  it('shows nothing for the first fifteen minutes', () => {
    expect(inactivityPhase(INACTIVITY_LIMIT_MS)).toBe('idle');
    // 14:59 inactive — one second before the warning is due.
    expect(inactivityPhase(minutes(15) + 1_000)).toBe('idle');
  });

  it('warns exactly at fifteen minutes remaining', () => {
    // Reached, not crossed. A `<` here would leave the warning a tick late, and
    // on a suspended tab a tick can be minutes.
    expect(inactivityPhase(minutes(15))).toBe('warning');
  });

  it('escalates in the final five minutes and interrupts in the final two', () => {
    expect(inactivityPhase(minutes(5) + 1)).toBe('warning');
    expect(inactivityPhase(minutes(5))).toBe('urgent');
    expect(inactivityPhase(minutes(2) + 1)).toBe('urgent');
    expect(inactivityPhase(minutes(2))).toBe('critical');
  });

  it('expires at zero, not below it', () => {
    expect(inactivityPhase(1)).toBe('critical');
    expect(inactivityPhase(0)).toBe('expired');
    expect(inactivityPhase(-60_000)).toBe('expired');
  });
});

describe('remainingMs', () => {
  it('recomputes from the deadline rather than from elapsed ticks', () => {
    const deadline = nextDeadline(1_000);
    // A tab suspended for an hour wakes to an expired session, not to whatever
    // its stopped interval last believed.
    expect(remainingMs(deadline, 1_000 + minutes(60))).toBe(0);
    expect(remainingMs(deadline, 1_000 + minutes(10))).toBe(minutes(20));
  });

  it('reports activity at 29:59 as a session that is still alive', () => {
    const deadline = nextDeadline(0);
    expect(remainingMs(deadline, minutes(29) + 59_000)).toBe(1_000);
    expect(inactivityPhase(remainingMs(deadline, minutes(29) + 59_000))).toBe(
      'critical',
    );
  });
});

describe('laterDeadline', () => {
  it('takes the later deadline so a working tab keeps a quiet one alive', () => {
    // §9.2 — a student typing in one tab has not been idle. Taking the earlier
    // deadline would sign them out because a background tab was quiet.
    expect(laterDeadline(1_000, 9_000)).toBe(9_000);
    expect(laterDeadline(9_000, 1_000)).toBe(9_000);
  });

  it('adopts whichever side actually has one', () => {
    expect(laterDeadline(null, 5_000)).toBe(5_000);
    expect(laterDeadline(5_000, null)).toBe(5_000);
    expect(laterDeadline(null, null)).toBeNull();
  });
});

describe('countdown', () => {
  it('keeps a fixed width so the header does not jitter', () => {
    expect(countdown(minutes(15))).toBe('15:00');
    expect(countdown(minutes(1) + 5_000)).toBe('01:05');
    expect(countdown(9_000)).toBe('00:09');
    expect(countdown(0)).toBe('00:00');
  });

  it('rounds up, so the last second is shown rather than skipped', () => {
    expect(countdown(1)).toBe('00:01');
  });
});

describe('shouldAnnounce', () => {
  it('speaks only at the thresholds that change what to do', () => {
    expect(
      shouldAnnounce({ previousMs: minutes(15) + 1_000, remainingMs: minutes(15) }),
    ).toBe(true);
    expect(
      shouldAnnounce({ previousMs: minutes(15), remainingMs: minutes(15) - 1_000 }),
    ).toBe(false);
  });

  it('announces a threshold a suspended tab slept through', () => {
    // Waking past two thresholds must say something rather than nothing.
    expect(shouldAnnounce({ previousMs: minutes(14), remainingMs: 20_000 })).toBe(
      true,
    );
  });

  it('says nothing on the first reading', () => {
    expect(shouldAnnounce({ previousMs: null, remainingMs: 30_000 })).toBe(false);
  });
});

describe('shouldSyncStudentSession', () => {
  it('publishes immediately, then at most once per heartbeat cadence', () => {
    expect(shouldSyncStudentSession(null, 1_000)).toBe(true);
    expect(shouldSyncStudentSession(1_000, 15_999)).toBe(false);
    expect(shouldSyncStudentSession(1_000, 16_000)).toBe(true);
  });
});

describe('safeReturnPath', () => {
  it('keeps a same-origin learning path', () => {
    expect(safeReturnPath('/studio/academies/a/learn/exercises/b')).toBe(
      '/studio/academies/a/learn/exercises/b',
    );
  });

  it('drops the query, where a token or an answer would be', () => {
    expect(safeReturnPath('/learn/exercises/b?submission=secret')).toBe(
      '/learn/exercises/b',
    );
  });

  it('refuses anything that could leave the origin', () => {
    expect(safeReturnPath('//evil.example.com/phish')).toBeNull();
    expect(safeReturnPath('https://evil.example.com')).toBeNull();
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
  });
});
