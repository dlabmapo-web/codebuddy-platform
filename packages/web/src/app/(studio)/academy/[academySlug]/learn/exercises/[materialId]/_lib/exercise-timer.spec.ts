import { describe, expect, it } from 'vitest';

import { formatExerciseDuration } from './exercise-timer';

describe('formatExerciseDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatExerciseDuration(65)).toBe('01:05');
  });

  it('adds hours only when needed', () => {
    expect(formatExerciseDuration(3_661)).toBe('01:01:01');
  });
});
