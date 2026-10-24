import { describe, expect, it } from 'vitest';
import { manualLatestSubmission, type ManualAttempt } from './manual.js';
import { shouldPollLatestSubmission } from './latest-submission.js';

const attempt: ManualAttempt = { id: 'a', userId: 'u', classId: 'c', files: {}, answer: '', createdAt: '2026-10-23T00:00:00Z', maximumHundredths: 2550, includeInScore: true, reviewVersion: 0, reviews: [] };
describe('latest manual submission semantics', () => {
  it('distinguishes an unsubmitted activity, a private ungraded attempt, and pending coursework', () => {
    expect(manualLatestSubmission(undefined)).toBeNull();
    expect(manualLatestSubmission(attempt)).toMatchObject({ status: 'AWAITING_REVIEW', scoreHundredths: null });
    expect(manualLatestSubmission(attempt, true)).toMatchObject({ status: 'RECORDED', scoreHundredths: null });
  });
  it('preserves a real zero and frozen decimal maximum', () => {
    const value = manualLatestSubmission({ ...attempt, shortAnswerAssessment: { status: 'GRADED', verdict: 'INCORRECT', completed: false, scoreHundredths: 0 } }, true);
    expect(value).toMatchObject({ status: 'GRADED', scoreHundredths: 0, maximumHundredths: 2550, createdAt: attempt.createdAt });
  });
  it('uses a published manual review and never fabricates an automatic score', () => {
    const reviewed = { ...attempt, reviews: [{ id: 'r', scoreHundredths: 1234, completed: false, feedback: '', version: 1, createdAt: '2026-10-24T00:00:00Z' }] };
    expect(manualLatestSubmission(reviewed)).toMatchObject({ status: 'GRADED', scoreHundredths: 1234, createdAt: attempt.createdAt });
    expect(manualLatestSubmission({ ...attempt, shortAnswerAssessment: { status: 'MANUAL', verdict: null, completed: null, scoreHundredths: null } }, true)?.status).toBe('RECORDED');
  });
  it('distinguishes evaluator errors from pending grading and bounds polling', () => {
    const now = Date.parse(attempt.createdAt);
    const error = manualLatestSubmission({ ...attempt, shortAnswerAssessment: { status: 'ERROR', verdict: null, completed: null, scoreHundredths: null } });
    expect(error).toMatchObject({ status: 'ERROR', scoreHundredths: null });
    const pending = manualLatestSubmission({ ...attempt, shortAnswerAssessment: { status: 'QUEUED', verdict: null, completed: null, scoreHundredths: null } });
    expect(shouldPollLatestSubmission(pending, now + 1000)).toBe(true);
    expect(shouldPollLatestSubmission(pending, now + 120000)).toBe(false);
    expect(shouldPollLatestSubmission(error, now)).toBe(false);
  });
});
