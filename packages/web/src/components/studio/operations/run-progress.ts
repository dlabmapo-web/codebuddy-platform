import type { OperationRun } from '@cove/shared';
import { operationRunProgress } from '@cove/shared';

/**
 * What a run's counters mean, in one sentence.
 *
 * Pure, and separate from the table, because the interesting cases are the ones
 * that are easy to get wrong on a screen and easy to assert here: a run that
 * repaired everything, a run that repaired most of it, a run that found nothing
 * to do, and a run still handing out work.
 */
export type RunSentence =
  | { key: 'progress.planning' }
  | { key: 'progress.running'; settled: number; total: number }
  | { key: 'progress.nothing' }
  | { key: 'progress.completed'; count: number }
  | { key: 'progress.completed_with_failures'; completed: number; failed: number }
  | { key: 'progress.failed' };

export function runSentence(run: OperationRun): RunSentence {
  if (run.status === 'PLANNING') return { key: 'progress.planning' };
  if (run.status === 'FAILED') return { key: 'progress.failed' };

  if (run.status === 'RUNNING') {
    const { settled, total } = operationRunProgress(run);
    return { key: 'progress.running', settled, total };
  }

  // COMPLETED. A run that dispatched nothing found nothing to do, which is a
  // real answer and not a failure — the problem was already graded the way it
  // grades today, or a student had resubmitted while the dialog was open.
  if (run.dispatchedCount === 0) return { key: 'progress.nothing' };
  if (run.failedCount > 0) {
    return {
      key: 'progress.completed_with_failures',
      completed: run.completedCount,
      failed: run.failedCount,
    };
  }
  return { key: 'progress.completed', count: run.completedCount };
}
