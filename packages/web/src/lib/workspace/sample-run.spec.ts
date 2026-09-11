import { describe, expect, it } from 'vitest';

import {
  comparesSampleLocally,
  createSampleInputQueue,
  stdinActionFor,
  isSampleOutputMatch,
  normalizeSampleOutput,
  resolveSampleVerdict,
} from './sample-run';

describe('createSampleInputQueue', () => {
  it('returns nothing for empty input', () => {
    expect(createSampleInputQueue('')).toEqual([]);
  });

  it('does not append a phantom line for a trailing newline', () => {
    // A program reading exactly two lines must not be left waiting on a third.
    expect(createSampleInputQueue('1\n2\n')).toEqual(['1', '2']);
  });

  it('keeps the last line when there is no trailing newline', () => {
    expect(createSampleInputQueue('1\n2')).toEqual(['1', '2']);
  });

  it('normalises CRLF and lone CR', () => {
    expect(createSampleInputQueue('1\r\n2\r3')).toEqual(['1', '2', '3']);
  });

  it('preserves interior blank lines', () => {
    expect(createSampleInputQueue('1\n\n3')).toEqual(['1', '', '3']);
  });
});

describe('normalizeSampleOutput', () => {
  it('strips trailing whitespace and newlines', () => {
    expect(normalizeSampleOutput('3\n\n  ')).toBe('3');
  });

  it('preserves interior whitespace', () => {
    expect(normalizeSampleOutput('1  2\n3')).toBe('1  2\n3');
  });

  it('preserves leading whitespace', () => {
    expect(normalizeSampleOutput('  indented')).toBe('  indented');
  });
});

describe('isSampleOutputMatch', () => {
  it('ignores a missing trailing newline', () => {
    expect(isSampleOutputMatch('3', '3\n')).toBe(true);
  });

  it('treats differing interior spacing as a mismatch', () => {
    expect(isSampleOutputMatch('1 2', '1  2')).toBe(false);
  });

  it('matches empty output against empty expectation', () => {
    expect(isSampleOutputMatch('', '\n')).toBe(true);
  });
});

describe('resolveSampleVerdict', () => {
  const base = { stdout: '3', expectedOutput: '3', stopped: false, failed: false };

  it('reports a match', () => {
    expect(resolveSampleVerdict(base)).toEqual({ kind: 'match' });
  });

  it('reports a mismatch with both normalised sides', () => {
    expect(
      resolveSampleVerdict({ ...base, stdout: '4\n' }),
    ).toEqual({ kind: 'mismatch', expected: '3', actual: '4' });
  });

  it('skips comparison after a crash rather than calling it wrong', () => {
    // A SyntaxError is not a wrong answer, and saying so misdirects the student.
    expect(
      resolveSampleVerdict({ ...base, stdout: '', failed: true }),
    ).toEqual({ kind: 'skipped', reason: 'error' });
  });

  it('skips comparison when the student stopped the run', () => {
    expect(
      resolveSampleVerdict({ ...base, stdout: '', stopped: true }),
    ).toEqual({ kind: 'skipped', reason: 'stopped' });
  });

  it('treats a stop during a failing run as stopped', () => {
    expect(
      resolveSampleVerdict({ ...base, stopped: true, failed: true }),
    ).toEqual({ kind: 'skipped', reason: 'stopped' });
  });
});

describe('stdinActionFor', () => {
  it('feeds the next queued line while one remains', () => {
    expect(stdinActionFor({ next: '9', hasFixedInput: true })).toEqual({
      kind: 'line',
      text: '9',
    });
  });

  it('reports end of input once a sample run runs out', () => {
    // `sys.stdin.read()` reads until EOF. Prompting instead left the run
    // waiting on a student with nothing left to type, so a program that
    // passed on Submit hung in the browser.
    expect(stdinActionFor({ next: undefined, hasFixedInput: true })).toEqual({
      kind: 'eof',
    });
  });

  it('reports end of input for a sample whose input is empty', () => {
    expect(
      stdinActionFor({ next: undefined, hasFixedInput: true }),
    ).toEqual({ kind: 'eof' });
  });

  it('still prompts a plain run, where a person is the input', () => {
    expect(stdinActionFor({ next: undefined, hasFixedInput: false })).toEqual({
      kind: 'prompt',
    });
  });
});

describe('samples on weighted problems', () => {
  it('claims no verdict when the server grades by rules the browser does not reproduce', () => {
    expect(
      resolveSampleVerdict({
        stdout: 'A  \nB',
        expectedOutput: 'A\nB',
        stopped: false,
        failed: false,
        comparesLocally: false,
      }),
    ).toEqual({ kind: 'unchecked' });
  });

  it('still reports a crash, which needs no comparison', () => {
    expect(
      resolveSampleVerdict({
        stdout: '',
        expectedOutput: 'x',
        stopped: false,
        failed: true,
        comparesLocally: false,
      }),
    ).toEqual({ kind: 'skipped', reason: 'error' });
  });

  it('compares locally only for legacy grading', () => {
    expect(comparesSampleLocally('LEGACY_STDIO')).toBe(true);
    expect(comparesSampleLocally(undefined)).toBe(true);
    expect(comparesSampleLocally('ELICE_STDIO')).toBe(false);
  });
});
