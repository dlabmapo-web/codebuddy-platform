import type { TeacherSubmissionReview } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  initialLiveResultState,
  liveResultView,
  markedRead,
  readsReview,
  reviewAsSubmissionResult,
  withLatestSubmission,
  withMaterial,
  withResultEvent,
} from './live-submission-result';

const M1 = 'e0000000-0000-4000-8000-000000000031';
const M2 = 'e0000000-0000-4000-8000-000000000032';
const S1 = 'a0000000-0000-4000-8000-000000000001';
const S2 = 'a0000000-0000-4000-8000-000000000002';

const onM1 = withMaterial(initialLiveResultState, M1);

describe('the teacher result tab state', () => {
  it('follows one submission from grading to its verdict, marking each step unread', () => {
    const queued = withResultEvent(onM1, { submissionId: S1, materialId: M1, status: 'QUEUED' });
    expect(queued.current).toEqual({ submissionId: S1, materialId: M1, status: 'QUEUED' });
    expect(queued.unread).toBe(true);

    const read = markedRead(queued);
    const graded = withResultEvent(read, { submissionId: S1, materialId: M1, status: 'FAILED' });
    expect(graded.current?.status).toBe('FAILED');
    expect(graded.unread).toBe(true);
  });

  it('never moves a verdict back to grading when a late packet arrives', () => {
    const graded = withResultEvent(onM1, { submissionId: S1, materialId: M1, status: 'PASSED' });
    expect(withResultEvent(graded, { submissionId: S1, materialId: M1, status: 'RUNNING' })).toBe(graded);
  });

  it('ignores verdicts for an exercise the student is not on', () => {
    expect(withResultEvent(onM1, { submissionId: S1, materialId: M2, status: 'PASSED' })).toBe(onM1);
  });

  it('lets a newer submission replace an older one, and never the other way', () => {
    const first = withResultEvent(onM1, { submissionId: S1, materialId: M1, status: 'FAILED' });
    const second = withResultEvent(first, { submissionId: S2, materialId: M1, status: 'QUEUED' });
    expect(second.current?.submissionId).toBe(S2);
    expect(withResultEvent(second, { submissionId: S1, materialId: M1, status: 'FAILED' })).toBe(second);
  });

  it('clears when the student moves to another exercise', () => {
    const graded = withResultEvent(onM1, { submissionId: S1, materialId: M1, status: 'FAILED' });
    const moved = withMaterial(graded, M2);
    expect(moved.current).toBeNull();
    expect(moved.unread).toBe(false);
  });

  it('fills an empty tab with the latest submission on arrival, without calling it news', () => {
    const joined = withLatestSubmission(onM1, { submissionId: S1, status: 'PASSED' }, M1);
    expect(joined.current).toEqual({ submissionId: S1, materialId: M1, status: 'PASSED' });
    expect(joined.unread).toBe(false);
  });

  it('does not let the arrival snapshot override what the socket already said', () => {
    const live = withResultEvent(onM1, { submissionId: S2, materialId: M1, status: 'QUEUED' });
    expect(withLatestSubmission(live, { submissionId: S1, status: 'FAILED' }, M1)).toBe(live);
    expect(withLatestSubmission(onM1, { submissionId: S1, status: 'FAILED' }, M2)).toBe(onM1);
  });
});

describe('liveResultView', () => {
  const idle = { loading: false, failed: false, loaded: false };

  it('names every state the tab can be in', () => {
    expect(liveResultView(null, idle)).toBe('empty');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'RUNNING' }, idle)).toBe('grading');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'ERRORED' }, idle)).toBe('fault');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'CANCELLED' }, idle)).toBe('cancelled');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'FAILED' }, { ...idle, loading: true })).toBe('loading');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'FAILED' }, { ...idle, failed: true })).toBe('error');
    expect(liveResultView({ submissionId: S1, materialId: M1, status: 'PASSED' }, { ...idle, loaded: true })).toBe('result');
  });

  it('reads a review only for a graded verdict', () => {
    expect(readsReview(null)).toBe(false);
    expect(readsReview({ submissionId: S1, materialId: M1, status: 'QUEUED' })).toBe(false);
    expect(readsReview({ submissionId: S1, materialId: M1, status: 'ERRORED' })).toBe(false);
    expect(readsReview({ submissionId: S1, materialId: M1, status: 'FAILED' })).toBe(true);
  });
});

describe('reviewAsSubmissionResult', () => {
  it('carries sample detail and never gives a hidden case any text', () => {
    const review = {
      submissionId: S1,
      materialId: M1,
      score: 50,
      passedCount: 1,
      totalCount: 2,
      runtimeMs: 12,
      solveElapsedSec: 300,
      createdAt: '2026-09-17T06:00:00.000Z',
      cases: [
        { position: 1, isSample: true, outcome: 'WRONG_OUTPUT', runtimeMs: 5, input: 'a b', expectedOutput: 'b a', actualOutput: 'a b' },
        // A malformed review must still not leak through the adapter.
        { position: 2, isSample: false, outcome: 'PASSED', runtimeMs: 6, input: 'SECRET', expectedOutput: 'SECRET', actualOutput: 'SECRET' },
      ],
    } as unknown as TeacherSubmissionReview;

    const result = reviewAsSubmissionResult(review, 'FAILED');

    expect(result).toMatchObject({ submissionId: S1, materialId: M1, status: 'FAILED', score: 50, passedCount: 1, totalCount: 2 });
    expect(result.cases[0]).toMatchObject({ input: 'a b', expectedOutput: 'b a', actualOutput: 'a b' });
    expect(result.cases[1]).toMatchObject({ input: null, expectedOutput: null, actualOutput: null });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});
