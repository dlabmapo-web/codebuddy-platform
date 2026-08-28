import { describe, expect, it } from 'vitest';

import {
  attentionKindsOf,
  attentionMessage,
  durationDisplay,
  isFiltered,
  meterWidth,
  outlineLabel,
} from './progress-view';

describe('durationDisplay', () => {
  it('reports an absence rather than a zero', () => {
    // Attempts predating solve sessions measured nothing. "0s" would claim
    // the student solved it instantly.
    expect(durationDisplay(null)).toEqual({ kind: 'missing' });
  });

  it('picks the largest unit that carries information', () => {
    expect(durationDisplay(45)).toEqual({ kind: 'seconds', seconds: 45 });
    expect(durationDisplay(125)).toEqual({
      kind: 'minutes',
      minutes: 2,
      seconds: 5,
    });
    expect(durationDisplay(3_725)).toEqual({
      kind: 'hours',
      hours: 1,
      minutes: 2,
    });
  });
});

describe('attentionMessage', () => {
  it('carries the number that explains the reason', () => {
    expect(attentionMessage({ kind: 'repeated_failures', value: 5 })).toEqual({
      key: 'progress.attention.repeated_failures',
      count: 5,
      duration: { kind: 'missing' },
    });
  });

  it('turns a long solve into a duration a teacher can act on', () => {
    expect(attentionMessage({ kind: 'long_solve', value: 3_600 })).toMatchObject(
      { duration: { kind: 'hours', hours: 1, minutes: 0 } },
    );
  });
});

describe('attentionKindsOf', () => {
  it('prints coexisting reasons in one stable order', () => {
    expect(
      attentionKindsOf([
        { kind: 'long_solve', value: 3_600 },
        { kind: 'repeated_failures', value: 4 },
        { kind: 'repeated_failures', value: 4 },
      ]),
    ).toEqual(['repeated_failures', 'long_solve']);
  });
});

describe('meterWidth', () => {
  it('clamps whatever it is given', () => {
    expect(meterWidth(50)).toBe('50%');
    expect(meterWidth(-10)).toBe('0%');
    expect(meterWidth(140)).toBe('100%');
  });
});

describe('isFiltered', () => {
  const empty = { q: '', courseIds: [], statuses: [], attention: [] };

  it('separates an empty class from an empty result', () => {
    expect(isFiltered(empty)).toBe(false);
    expect(isFiltered({ ...empty, q: '  ' })).toBe(false);
    expect(isFiltered({ ...empty, q: 'ada' })).toBe(true);
    expect(isFiltered({ ...empty, attention: ['stalled'] })).toBe(true);
  });
});

describe('outlineLabel', () => {
  it('omits a coordinate it does not have', () => {
    expect(outlineLabel('2-1-3', 'Sum two numbers')).toBe(
      '2-1-3 Sum two numbers',
    );
    expect(outlineLabel(null, 'Sum two numbers')).toBe('Sum two numbers');
  });
});
