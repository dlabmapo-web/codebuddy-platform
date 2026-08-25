import type { CaseOutcome, SubmissionResult } from '@cove/shared';

/**
 * Display helpers for a verdict. The score itself is computed by the judge —
 * these only decide how it reads.
 */

export type VerdictTone = 'passed' | 'failed' | 'judge-error' | 'running';

export type ResultPresentation =
  | 'grading'
  | 'accepted'
  | 'wrong_output'
  | 'runtime_error'
  | 'time_limit'
  | 'memory_limit'
  | 'not_accepted'
  | 'judge_error'
  | 'transport_error';

/**
 * One presentation key drives the hero's icon, tone, headline, and guidance.
 * Keeping this pure prevents the visual treatment and the instructional copy
 * from drifting into different interpretations of the same verdict.
 */
export function resultPresentation(
  result: SubmissionResult | null,
  submitting: boolean,
  hasTransportError = false,
): ResultPresentation {
  if (hasTransportError && !result) return 'transport_error';
  if (!result) return 'grading';
  if (result.status === 'ERRORED' || result.status === 'CANCELLED') {
    return 'judge_error';
  }
  if (result.status === 'PASSED') return 'accepted';

  const failure = result.cases.find(
    (item) => item.outcome !== 'PASSED' && item.outcome !== 'SKIPPED',
  );
  if (!failure) return 'not_accepted';

  switch (failure.outcome) {
    case 'WRONG_OUTPUT':
      return 'wrong_output';
    case 'RUNTIME_ERROR':
      return 'runtime_error';
    case 'TIME_LIMIT':
      return 'time_limit';
    case 'MEMORY_LIMIT':
      return 'memory_limit';
    default:
      return 'not_accepted';
  }
}

export function verdictTone(
  result: SubmissionResult | null,
  submitting: boolean,
): VerdictTone {
  const presentation = resultPresentation(result, submitting);
  if (presentation === 'accepted') return 'passed';
  if (presentation === 'judge_error') return 'judge-error';
  if (presentation === 'grading') return 'running';
  return 'failed';
}

/**
 * A judge fault earned no score and lost none, so showing 0/100 beside it would
 * read as the student's failure.
 */
export function showsScore(result: SubmissionResult | null): boolean {
  return result !== null && result.status !== 'ERRORED' && result.status !== 'CANCELLED';
}

/**
 * The first sample that failed, which is the only case allowed to show a diff.
 * A hidden case reports position and outcome and nothing else.
 */
export function firstFailedSample(
  result: SubmissionResult | null,
): SubmissionResult['cases'][number] | null {
  if (!result) return null;
  return (
    result.cases.find(
      (item) =>
        item.isSample && item.outcome !== 'PASSED' && item.outcome !== 'SKIPPED',
    ) ?? null
  );
}

export function skippedCount(result: SubmissionResult | null): number {
  if (!result) return 0;
  return result.cases.filter((item) => item.outcome === 'SKIPPED').length;
}

/** Hidden cases on the tape, for the "results only" disclosure note. */
export function hiddenResultCount(result: SubmissionResult | null): number {
  if (!result) return 0;
  return result.cases.filter((item) => !item.isSample).length;
}

export const outcomeTone: Record<CaseOutcome, 'pass' | 'fail' | 'limit' | 'idle'> = {
  PASSED: 'pass',
  WRONG_OUTPUT: 'fail',
  RUNTIME_ERROR: 'fail',
  TIME_LIMIT: 'limit',
  MEMORY_LIMIT: 'limit',
  SKIPPED: 'idle',
};
