import { describe, expect, it } from 'vitest';

import { waitedFor } from './waited-for';

const now = new Date('2026-09-02T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('waitedFor', () => {
  it('answers in the largest unit that is true', () => {
    expect(waitedFor(ago(3 * 86_400_000), now)).toMatchObject({
      unit: 'days',
      value: 3,
    });
    expect(waitedFor(ago(5 * 3_600_000), now)).toMatchObject({
      unit: 'hours',
      value: 5,
    });
    expect(waitedFor(ago(20 * 60_000), now)).toMatchObject({
      unit: 'minutes',
      value: 20,
    });
  });

  it('does not print a number that is wrong by the time it is read', () => {
    expect(waitedFor(ago(20_000), now).unit).toBe('just_now');
  });

  it('carries the day count in every unit', () => {
    // The caller decides something *about* the age — three days unanswered in
    // an academy with nobody to answer — without re-deriving it.
    expect(waitedFor(ago(5 * 3_600_000), now).days).toBe(0);
    expect(waitedFor(ago(4 * 86_400_000), now).days).toBe(4);
  });

  it('never reports a negative wait', () => {
    // A row written by a clock a second ahead of this one must not read as
    // "-1 minutes".
    expect(waitedFor(new Date(now.getTime() + 5_000).toISOString(), now)).toMatchObject({
      unit: 'just_now',
      value: 0,
    });
  });
});
