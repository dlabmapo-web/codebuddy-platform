import { describe, expect, it } from 'vitest';

import { byMostRecent, elapsedSince } from './elapsed';

const now = Date.parse('2026-08-28T12:00:00.000Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('elapsedSince', () => {
  it('reads a draft saved seconds ago as now, not as a minute', () => {
    // The student was on this page when it saved; "1 minute ago" would be a
    // rounding artefact reported as a fact.
    expect(elapsedSince(ago(59_000), now)).toEqual([0, 'minute']);
  });

  it('scales through minutes, hours, days and weeks', () => {
    expect(elapsedSince(ago(5 * 60_000), now)).toEqual([-5, 'minute']);
    expect(elapsedSince(ago(3 * 3_600_000), now)).toEqual([-3, 'hour']);
    expect(elapsedSince(ago(2 * 86_400_000), now)).toEqual([-2, 'day']);
    expect(elapsedSince(ago(3 * 7 * 86_400_000), now)).toEqual([-3, 'week']);
  });

  it('stops at weeks rather than inventing months', () => {
    const [, unit] = elapsedSince(ago(400 * 86_400_000), now) ?? [];
    expect(unit).toBe('week');
  });

  it('answers null for a timestamp it cannot read', () => {
    // The row still has to render: a draft with a broken date is still a
    // draft the student can open and discard.
    expect(elapsedSince('not-a-date', now)).toBeNull();
  });
});

describe('byMostRecent', () => {
  it('puts the newest draft first', () => {
    const drafts = [
      { updatedAt: ago(3 * 86_400_000), id: 'old' },
      { updatedAt: ago(60_000), id: 'newest' },
      { updatedAt: ago(2 * 3_600_000), id: 'middle' },
    ];

    expect([...drafts].sort(byMostRecent).map((d) => d.id)).toEqual([
      'newest',
      'middle',
      'old',
    ]);
  });
});
