import { describe, expect, it } from 'vitest';
import { automaticLatestSubmission } from './latest-submission.js';
describe('latest automatic attempt projection', () => {
  const row = { id: 'attempt', createdAt: new Date('2026-10-23T00:00:00Z'), status: 'PASSED', score: 100 };
  it('does not turn a queued or failed evaluator attempt into a zero grade', () => {
    expect(automaticLatestSubmission(null)).toBeNull();
    expect(automaticLatestSubmission({ ...row, status: 'QUEUED', score: 0 })).toMatchObject({ status: 'PENDING', scoreHundredths: null });
    expect(automaticLatestSubmission({ ...row, status: 'ERRORED', score: 0 })).toMatchObject({ status: 'ERROR', scoreHundredths: null });
    expect(automaticLatestSubmission({ ...row, gradingAborted: true })).toMatchObject({ status: 'ERROR', scoreHundredths: null });
  });
  it('keeps true zero grades and frozen weighted scores instead of rounding to percentages', () => {
    expect(automaticLatestSubmission({ ...row, status: 'FAILED', score: 0 })).toMatchObject({ status: 'GRADED', scoreHundredths: 0 });
    expect(automaticLatestSubmission({ ...row, appliedScoreHundredths: 1234, materialMaximumHundredths: 2550 })).toMatchObject({ scoreHundredths: 1234, maximumHundredths: 2550, createdAt: row.createdAt.toISOString() });
  });
});
