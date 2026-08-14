import { overviewAttentionKinds } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  attentionReasonDisplayValue,
  attentionTones,
  durationDisplay,
  meterWidth,
  participationWidth,
  shortName,
} from './overview-view';

/**
 * The presentation decisions that would otherwise be wrong quietly.
 *
 * A duration rounded the wrong way, a percentage that overflows its bar, or a
 * name truncated mid-grapheme all render perfectly happily — they just say
 * something false, and only to the reader.
 */

describe('attentionReasonDisplayValue', () => {
  it('converts a long failed attempt from stored seconds to display minutes', () => {
    expect(
      attentionReasonDisplayValue({ kind: 'long_solve', value: 2_400 }),
    ).toBe(40);
  });

  it('keeps other attention measurements in their native display unit', () => {
    expect(
      attentionReasonDisplayValue({ kind: 'repeated_failures', value: 58 }),
    ).toBe(58);
    expect(
      attentionReasonDisplayValue({ kind: 'low_participation', value: 12 }),
    ).toBe(12);
  });
});

describe('durationDisplay', () => {
  it('never reports measured time as nothing', () => {
    // Twenty counted seconds is a student who was there. "0m" is the one thing
    // it must not say, because it reads as the student having done nothing.
    expect(durationDisplay(20)).toEqual({ kind: 'minutes', minutes: 1 });
  });

  it('separates no time from no measurement', () => {
    expect(durationDisplay(0)).toEqual({ kind: 'none' });
    expect(durationDisplay(null)).toEqual({ kind: 'none' });
  });

  it('splits into hours and minutes at the hour', () => {
    expect(durationDisplay(3_600)).toEqual({
      kind: 'hours',
      hours: 1,
      minutes: 0,
    });
    expect(durationDisplay(16_920)).toEqual({
      kind: 'hours',
      hours: 4,
      minutes: 42,
    });
  });

  it('switches at the rounded hour, not at the raw one', () => {
    // The threshold is applied to the rounded minutes, so 59m30s reads as
    // "1h 0m" rather than as the "60m" a raw comparison would print.
    expect(durationDisplay(3_569)).toEqual({ kind: 'minutes', minutes: 59 });
    expect(durationDisplay(3_570)).toEqual({
      kind: 'hours',
      hours: 1,
      minutes: 0,
    });
  });
});

describe('meterWidth', () => {
  it('clamps to the bar it fills', () => {
    expect(meterWidth(-10)).toBe('0%');
    expect(meterWidth(140)).toBe('100%');
    expect(meterWidth(48)).toBe('48%');
  });

  it('draws nothing when nothing was measured', () => {
    expect(meterWidth(null)).toBe('0%');
  });
});

describe('shortName', () => {
  it('leaves a name that fits alone', () => {
    expect(shortName('Ada')).toBe('Ada');
    expect(shortName('김지우')).toBe('김지우');
  });

  it('cuts by grapheme rather than by byte', () => {
    // A byte-based cut would split a Hangul syllable and render a broken glyph.
    expect(shortName('김지우박서준윤하은', 4)).toBe('김지우…');
  });
});

describe('attentionTones', () => {
  it('has a tone for every reason the server can send', () => {
    // A missing entry renders an unstyled chip, which is the failure mode that
    // looks deliberate and therefore never gets reported.
    for (const kind of overviewAttentionKinds) {
      expect(attentionTones[kind]).toBeTruthy();
    }
  });

  it('has no green tone', () => {
    // §6.3 — a chip is a factual condition to inspect, never a verdict on the
    // child. "Not flagged" is the absence of a chip, not a green one.
    for (const tone of Object.values(attentionTones)) {
      expect(tone).not.toContain('success');
    }
  });
});

describe('participationWidth', () => {
  it('keeps a small class from rendering as giant columns', () => {
    expect(participationWidth(3)).toBe(560);
  });

  it('grows so a wide class scrolls rather than dropping students', () => {
    // §6.5 forbids silently showing only the most active students, so the plot
    // has to be able to get wider than the panel.
    expect(participationWidth(40)).toBeGreaterThan(560);
  });
});
