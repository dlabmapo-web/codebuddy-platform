import type {
  AggregateJudgeResult,
  CaseOutcome,
  CompletedCaseResult,
} from './types';

export function mapJudge0Status(statusId: number): CaseOutcome | null {
  if (statusId === 1 || statusId === 2) return null;
  if (statusId === 3) return 'accepted';
  if (statusId === 4) return 'wrong_answer';
  if (statusId === 5) return 'time_limit_exceeded';
  if (statusId === 6) return 'compilation_error';
  if (statusId >= 7 && statusId <= 12) return 'runtime_error';
  return 'judge_error';
}

export function finalizeCaseResults(
  cases: CompletedCaseResult[],
): AggregateJudgeResult | null {
  if (cases.length === 0) return null;

  const totalCount = cases.length;
  const runtimeMs = cases.reduce(
    (sum, item) => sum + Math.max(0, item.runtimeMs ?? 0),
    0,
  );

  if (cases.some((item) => item.outcome === 'judge_error')) {
    return {
      status: 'judge_error',
      score: 0,
      passedCount: 0,
      totalCount,
      runtimeMs,
    };
  }

  const passedCount = cases.filter((item) => item.outcome === 'accepted').length;
  const score = Math.round((100 * passedCount) / totalCount);

  return {
    status:
      passedCount === totalCount
        ? 'pass'
        : passedCount > 0
          ? 'partial'
          : 'fail',
    score,
    passedCount,
    totalCount,
    runtimeMs,
  };
}

export function judge0SecondsToMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const seconds = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}
