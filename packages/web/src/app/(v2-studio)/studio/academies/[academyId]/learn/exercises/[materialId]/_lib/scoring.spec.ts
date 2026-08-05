import { describe, expect, it } from 'vitest';
import type { SubmissionResult } from '@cove/shared';

import {
  firstFailedSample,
  hiddenResultCount,
  resultPresentation,
  showsScore,
  skippedCount,
  verdictTone,
} from './scoring';

function result(overrides: Partial<SubmissionResult> = {}): SubmissionResult {
  return {
    submissionId: '11111111-1111-4111-8111-111111111111',
    materialId: '22222222-2222-4222-8222-222222222222',
    status: 'FAILED',
    passedCount: 1,
    totalCount: 5,
    score: 20,
    runtimeMs: 4,
    failureReason: null,
    elapsedSec: 12,
    attemptCount: 1,
    createdAt: '2026-08-03T00:00:00.000Z',
    gradedAt: '2026-08-03T00:00:01.000Z',
    cases: [],
    ...overrides,
  };
}

const sampleCase = (over = {}) => ({
  position: 1,
  isSample: true,
  outcome: 'PASSED' as const,
  runtimeMs: 3,
  input: '9',
  expectedOutput: 'FIZZ',
  actualOutput: 'FIZZ',
  ...over,
});

describe('verdictTone', () => {
  it('separates a judge fault from a failed answer', () => {
    expect(verdictTone(result({ status: 'ERRORED' }), false)).toBe('judge-error');
    expect(verdictTone(result({ status: 'FAILED' }), false)).toBe('failed');
    expect(verdictTone(result({ status: 'PASSED' }), false)).toBe('passed');
  });
});

describe('resultPresentation', () => {
  it.each([
    ['WRONG_OUTPUT', 'wrong_output'],
    ['RUNTIME_ERROR', 'runtime_error'],
    ['TIME_LIMIT', 'time_limit'],
    ['MEMORY_LIMIT', 'memory_limit'],
  ] as const)('maps %s to focused guidance', (outcome, expected) => {
    expect(
      resultPresentation(
        result({ cases: [sampleCase({ outcome })] }),
        false,
      ),
    ).toBe(expected);
  });

  it('separates accepted, grading, judge, and transport states', () => {
    expect(resultPresentation(result({ status: 'PASSED' }), false)).toBe(
      'accepted',
    );
    expect(resultPresentation(null, true)).toBe('grading');
    expect(resultPresentation(result({ status: 'ERRORED' }), false)).toBe(
      'judge_error',
    );
    expect(resultPresentation(null, false, true)).toBe('transport_error');
  });

  it('uses only the outcome of a hidden failure, never private values', () => {
    expect(
      resultPresentation(
        result({
          cases: [
            {
              ...sampleCase({ outcome: 'TIME_LIMIT' }),
              isSample: false,
              input: null,
              expectedOutput: null,
              actualOutput: null,
            },
          ],
        }),
        false,
      ),
    ).toBe('time_limit');
  });
});

describe('showsScore', () => {
  it('hides the score for a judge fault', () => {
    // Nothing was earned and nothing lost; 0/100 would read as the student's
    // failure rather than ours.
    expect(showsScore(result({ status: 'ERRORED' }))).toBe(false);
  });

  it('shows the score for a real verdict, including zero', () => {
    expect(showsScore(result({ status: 'FAILED', score: 0 }))).toBe(true);
    expect(showsScore(result({ status: 'PASSED', score: 100 }))).toBe(true);
  });
});

describe('firstFailedSample', () => {
  it('never returns a hidden case', () => {
    // The one rule the diff must obey: a hidden case may report an outcome and
    // nothing else, or a student reconstructs it by submitting probes.
    const found = firstFailedSample(
      result({
        cases: [
          sampleCase(),
          { ...sampleCase({ position: 2 }), isSample: false, outcome: 'WRONG_OUTPUT', input: null, expectedOutput: null, actualOutput: null },
        ],
      }),
    );
    expect(found).toBeNull();
  });

  it('returns the first failing sample', () => {
    const found = firstFailedSample(
      result({
        cases: [
          sampleCase(),
          sampleCase({ position: 2, outcome: 'WRONG_OUTPUT', actualOutput: 'BUZZ' }),
          sampleCase({ position: 3, outcome: 'WRONG_OUTPUT', actualOutput: 'X' }),
        ],
      }),
    );
    expect(found?.position).toBe(2);
  });

  it('ignores skipped cases', () => {
    expect(
      firstFailedSample(result({ cases: [sampleCase({ outcome: 'SKIPPED' })] })),
    ).toBeNull();
  });
});

describe('skippedCount and hiddenResultCount', () => {
  const cases = [
    sampleCase(),
    { ...sampleCase({ position: 2 }), isSample: false, outcome: 'WRONG_OUTPUT' as const },
    { ...sampleCase({ position: 3 }), isSample: false, outcome: 'SKIPPED' as const },
    { ...sampleCase({ position: 4 }), isSample: false, outcome: 'SKIPPED' as const },
  ];

  it('counts what the early exit left unrun', () => {
    expect(skippedCount(result({ cases }))).toBe(2);
  });

  it('counts every hidden result for the results-only note', () => {
    expect(hiddenResultCount(result({ cases }))).toBe(3);
  });
});
