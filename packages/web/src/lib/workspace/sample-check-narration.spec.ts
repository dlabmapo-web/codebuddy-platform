import type { SampleCheckView } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { narrateSampleCheck } from './sample-check-narration';

function view(overrides: Partial<SampleCheckView> = {}): SampleCheckView {
  return {
    checkId: '11111111-1111-4111-8111-111111111111',
    status: 'COMPLETED',
    position: 1,
    codeHash: 'hash',
    exerciseRevision: 2,
    refreshRequired: false,
    timings: { queueMs: 10, executionMs: 40, comparisonMs: 2 },
    result: {
      outcome: 'PASSED',
      outputMatched: true,
      softLimitExceeded: false,
      stdout: '4\n',
      stdoutTruncated: false,
      stderr: '',
      stderrTruncated: false,
      rule: { comparator: 'STDOUT', expected: '4' },
    },
    ...overrides,
  };
}

const messages = (narration: ReturnType<typeof narrateSampleCheck>) =>
  narration.lines.flatMap((line) => ('message' in line ? [line.message] : []));

describe('narrateSampleCheck', () => {
  it('passes with the output as printed and the practice reminder', () => {
    const narration = narrateSampleCheck(view(), { codeChanged: false });

    expect(narration.lines[0]).toEqual({ kind: 'out', text: '4\n' });
    expect(narration.lines).toContainEqual({
      kind: 'meta',
      message: 'workspace.sample_check_passed',
      mark: '✓',
    });
    expect(narration).toEqual(
      expect.objectContaining({ verdict: { kind: 'match' }, lifecycle: 'COMPLETED', passedCount: 1 }),
    );
  });

  it('never shows a slow correct answer as a plain green pass', () => {
    const narration = narrateSampleCheck(
      view({
        result: {
          ...view().result!,
          outcome: 'PASSED_WITH_WARNING',
          softLimitExceeded: true,
        },
      }),
      { codeChanged: false },
    );

    expect(narration.verdict).toEqual({ kind: 'warning' });
    expect(messages(narration)).toEqual(['workspace.sample_check_warning']);
    expect(narration.lines.some((line) => 'mark' in line && line.mark === '✓')).toBe(false);
  });

  it('explains a mismatch against the public rule, labelled by kind', () => {
    const narration = narrateSampleCheck(
      view({
        result: {
          ...view().result!,
          outcome: 'WRONG_OUTPUT',
          outputMatched: false,
          stdout: '  5  \n',
          rule: { comparator: 'STDOUT_REGEX', expected: '^10$' },
        },
      }),
      { codeChanged: false },
    );

    // Shown untrimmed; the rule is applied separately, never by editing output.
    expect(narration.lines[0]).toEqual({ kind: 'out', text: '  5  \n' });
    expect(narration.lines).toContainEqual({
      kind: 'info',
      rule: { comparator: 'STDOUT_REGEX', expected: '^10$' },
    });
    expect(narration).toEqual(expect.objectContaining({ lifecycle: 'FAILED', passedCount: 0 }));
  });

  it('reports a crash or a limit as the program’s, not as a wrong answer', () => {
    for (const [outcome, message] of [
      ['RUNTIME_ERROR', 'workspace.sample_check_runtime_error'],
      ['TIME_LIMIT', 'workspace.sample_check_time_limit'],
      ['MEMORY_LIMIT', 'workspace.sample_check_memory_limit'],
    ] as const) {
      const narration = narrateSampleCheck(
        view({
          result: { ...view().result!, outcome, outputMatched: null, stdout: '', stderr: 'ValueError: nope' },
        }),
        { codeChanged: false },
      );
      expect(messages(narration)).toEqual([message]);
      expect(narration.verdict).toEqual({ kind: 'skipped', reason: 'error' });
    }
  });

  it.each([
    ['UNAVAILABLE', 'workspace.sample_check_unavailable', { kind: 'unchecked' }],
    ['TIMED_OUT', 'workspace.sample_check_timed_out', { kind: 'unchecked' }],
    ['EXPIRED', 'workspace.sample_check_expired', { kind: 'unchecked' }],
    ['CANCELLED', 'workspace.sample_check_cancelled', { kind: 'skipped', reason: 'stopped' }],
  ] as const)(
    'a %s check claims no verdict and never counts as a wrong answer',
    (status, message, verdict) => {
      const narration = narrateSampleCheck(view({ status, result: null }), { codeChanged: false });

      expect(messages(narration)).toEqual([message]);
      expect(narration.verdict).toEqual(verdict);
      // Reported to a watching teacher as cancelled, not failed.
      expect(narration).toEqual(expect.objectContaining({ lifecycle: 'CANCELLED', passedCount: 0 }));
    },
  );

  it('says when output was shortened, the problem changed, or the code moved on', () => {
    const narration = narrateSampleCheck(
      view({
        refreshRequired: true,
        result: { ...view().result!, stdoutTruncated: true, rule: null },
      }),
      { codeChanged: true },
    );

    expect(messages(narration)).toEqual([
      'workspace.sample_check_truncated',
      'workspace.sample_check_passed',
      'workspace.sample_check_refresh',
      'workspace.sample_check_earlier_code',
    ]);
  });
});
