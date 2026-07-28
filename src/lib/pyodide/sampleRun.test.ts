import { describe, expect, it } from 'vitest';
import {
  createSampleInputQueue,
  isSampleOutputMatch,
  normalizeSampleOutput,
} from './sampleRun';

describe('createSampleInputQueue', () => {
  it('normalizes line endings and removes one trailing newline element', () => {
    expect(createSampleInputQueue('2\r\n1 2\r\n3 4\r\n')).toEqual([
      '2',
      '1 2',
      '3 4',
    ]);
  });

  it('preserves internal and intentional final blank input lines', () => {
    expect(createSampleInputQueue('first\n\nthird')).toEqual([
      'first',
      '',
      'third',
    ]);
    expect(createSampleInputQueue('first\n\n')).toEqual(['first', '']);
    expect(createSampleInputQueue('\n')).toEqual(['']);
  });

  it('returns no queued lines for an empty sample', () => {
    expect(createSampleInputQueue('')).toEqual([]);
  });
});

describe('sample output comparison', () => {
  it('normalizes line endings and trailing whitespace at the end', () => {
    expect(normalizeSampleOutput('answer\r\n\r\n')).toBe('answer');
    expect(isSampleOutputMatch('answer\n', 'answer   \r\n')).toBe(true);
  });

  it('keeps internal whitespace, line order, and case strict', () => {
    expect(isSampleOutputMatch('A  B\nC', 'A B\nC')).toBe(false);
    expect(isSampleOutputMatch('A\nB', 'B\nA')).toBe(false);
    expect(isSampleOutputMatch('Answer', 'answer')).toBe(false);
  });
});
