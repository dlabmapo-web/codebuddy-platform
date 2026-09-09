import type { OperationRun } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { runSentence } from './run-progress';

const run = (over: Partial<OperationRun>): OperationRun =>
  ({
    status: 'COMPLETED',
    plannedCount: 10,
    studentCount: 10,
    dispatchedCount: 10,
    completedCount: 10,
    failedCount: 0,
    ...over,
  }) as OperationRun;

describe('runSentence', () => {
  it('says nothing was needed when a run dispatched no repairs', () => {
    // The plan is re-read at confirmation time, so a student who resubmitted
    // while the dialog was open can empty it. That is a real answer, and
    // "0 records repaired" would read as a failure.
    expect(
      runSentence(run({ dispatchedCount: 0, completedCount: 0, plannedCount: 0 })),
    ).toEqual({ key: 'progress.nothing' });
  });

  it('names the failures rather than hiding them in a total', () => {
    // An operator who was promised ten and got eight has to be able to see
    // that from the row, without opening anything.
    expect(runSentence(run({ completedCount: 8, failedCount: 2 }))).toEqual({
      key: 'progress.completed_with_failures',
      completed: 8,
      failed: 2,
    });
  });

  it('counts progress against what was dispatched, not what was planned', () => {
    // Repairs are written in chunks, so mid-run the two disagree and a bar
    // measured against the plan would jump backwards as chunks land.
    expect(
      runSentence(
        run({ status: 'RUNNING', dispatchedCount: 4, completedCount: 3 }),
      ),
    ).toEqual({ key: 'progress.running', settled: 3, total: 4 });
  });

  it('reads a planning run as awaiting a person, not as stalled', () => {
    expect(runSentence(run({ status: 'PLANNING' }))).toEqual({
      key: 'progress.planning',
    });
  });

  it('reports a clean run by what it repaired', () => {
    expect(runSentence(run({ completedCount: 10 }))).toEqual({
      key: 'progress.completed',
      count: 10,
    });
  });
});
