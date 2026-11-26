import { describe, expect, it } from 'vitest';

import { examplesAreWrong, readRun, runIsWrong, shortOutput } from './ai-help-target';

const samples = [{ input: '3 5', expectedOutput: '8' }, { input: '10\n20\n', expectedOutput: '30\n' }];
const run = (over: Partial<Parameters<typeof readRun>[0]>) =>
  readRun({ typed: [], stdout: '', failed: false, stopped: false, samples, gradingMode: 'LEGACY_STDIO', inputPromptPolicy: 'INCLUDE', ...over });

describe('reading a Run for AI help (the campus courses design, §6)', () => {
  it('knows an example by its input and judges it as Test run does', () => {
    expect(run({ typed: ['3 5\n'], stdout: '-2\n' })).toEqual({ kind: 'mismatch', number: 1, expected: '8', actual: '-2' });
    expect(run({ typed: ['10\n', '20\n'], stdout: '30' })).toEqual({ kind: 'match', number: 2 });
    // Trailing spaces and blank lines at the end are not part of the input.
    expect(run({ typed: ['10  \n', '20\n', '\n'], stdout: '-10' })).toMatchObject({ kind: 'mismatch', number: 2 });
  });

  it('turns AI help on for an error or a wrong example, and leaves it off for the student\'s own input', () => {
    expect(runIsWrong(run({ failed: true }))).toBe(true);
    expect(runIsWrong(run({ typed: ['3 5\n'], stdout: '-2' }))).toBe(true);
    expect(runIsWrong(run({ typed: ['3 5\n'], stdout: '8' }))).toBe(false);
    expect(run({ typed: ['7 7\n'], stdout: '14' })).toEqual({ kind: 'own-input' });
    expect(runIsWrong(run({ typed: ['7 7\n'], stdout: '14' }))).toBe(false);
    expect(runIsWrong(run({ stopped: true }))).toBe(false);
  });

  it('lets the server decide where the browser cannot compare', () => {
    expect(run({ typed: ['3 5\n'], stdout: '8', inputPromptPolicy: 'IGNORE', gradingMode: 'ELICE_STDIO' })).toEqual({ kind: 'unchecked', number: 1 });
  });

  it('shortens an output for one line of text', () => {
    expect(shortOutput('')).toBe('(nothing)');
    expect(shortOutput('1\n2\n')).toBe('1 ⏎ 2');
    expect(shortOutput('x'.repeat(50))).toBe(`${'x'.repeat(40)}…`);
  });

  it('reads a Test run: any error, wrong output or output the browser cannot judge', () => {
    const match = { outcome: { stdout: '8' }, verdict: { kind: 'match' as const } };
    expect(examplesAreWrong([match, match])).toBe(false);
    expect(examplesAreWrong([match, { outcome: { stdout: '1' }, verdict: { kind: 'mismatch' as const, expected: '8', actual: '1' } }])).toBe(true);
    expect(examplesAreWrong([{ outcome: { error: { type: 'NameError' } }, verdict: { kind: 'skipped' as const, reason: 'error' as const } }])).toBe(true);
    expect(examplesAreWrong([{ outcome: { stdout: '8' }, verdict: { kind: 'unchecked' as const } }])).toBe(true);
    expect(examplesAreWrong([{ outcome: null, verdict: { kind: 'skipped' as const, reason: 'stopped' as const } }])).toBe(false);
  });
});
