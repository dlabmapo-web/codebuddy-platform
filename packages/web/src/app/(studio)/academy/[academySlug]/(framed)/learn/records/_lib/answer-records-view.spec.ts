import { answerRecordResults, SOLVE_SESSION_MAX_SECONDS } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  recordPathSegments,
  recordResultTones,
  reviewHref,
  solveTimeDisplay,
} from './answer-records-view';

const academyId = '20000000-0000-4000-8000-000000000001';
const materialId = '70000000-0000-4000-8000-000000000001';
const submissionId = 'a0000000-0000-4000-8000-000000000001';

describe('result badges', () => {
  it('covers every result the contract can produce', () => {
    for (const result of answerRecordResults) {
      expect(recordResultTones[result]).toBeTruthy();
    }
  });

  /** A platform failure must not be dressed as the student's mistake. */
  it('keeps a judge fault visually distinct from a wrong answer', () => {
    expect(recordResultTones.JUDGE_ERROR).not.toBe(
      recordResultTones.NOT_ACCEPTED,
    );
    expect(recordResultTones.JUDGE_ERROR).not.toBe(recordResultTones.ACCEPTED);
  });
});

describe('solve time display', () => {
  it('reports an unrecorded duration as missing, never as zero', () => {
    expect(solveTimeDisplay(null)).toEqual({ kind: 'missing' });
    expect(solveTimeDisplay(0)).toEqual({ kind: 'seconds', seconds: 0 });
  });

  it('picks the largest unit the duration actually reaches', () => {
    expect(solveTimeDisplay(42)).toEqual({ kind: 'seconds', seconds: 42 });
    expect(solveTimeDisplay(95)).toEqual({
      kind: 'minutes',
      minutes: 1,
      seconds: 35,
    });
    expect(solveTimeDisplay(3_725)).toEqual({
      kind: 'hours',
      hours: 1,
      minutes: 2,
    });
  });

  it('caps an abandoned session at the 24-hour bound', () => {
    expect(solveTimeDisplay(SOLVE_SESSION_MAX_SECONDS * 3)).toEqual({
      kind: 'hours',
      hours: 24,
      minutes: 0,
    });
  });
});

describe('problem cell', () => {
  const row = {
    submissionId,
    materialId,
    problemTitle: 'Sum two numbers',
    courseTitle: 'Python Foundations',
    moduleTitle: 'Basics',
    lectureTitle: 'Addition',
    modulePosition: 1,
    lecturePosition: 2,
    problemPosition: 3,
    result: 'ACCEPTED' as const,
    score: 100,
    passedCount: 2,
    totalCount: 2,
    solveElapsedSec: 95,
    createdAt: '2026-08-12T09:00:00.000Z',
    canOpenExercise: true,
  };

  it('prints the outline number and the frozen path', () => {
    expect(recordPathSegments(row)).toEqual({
      number: '1-2-3',
      path: ['Python Foundations', 'Basics', 'Addition'],
    });
  });

  it('prints no number for a row backfilled without a position', () => {
    expect(
      recordPathSegments({
        ...row,
        modulePosition: 0,
        lecturePosition: 0,
        problemPosition: 0,
      }).number,
    ).toBeNull();
  });
});

describe('review destination', () => {
  it('carries the selected attempt and the exact table state back', () => {
    const returnTo = `/academy/${academyId}/learn/records?page=2`;

    expect(reviewHref({ academySlug: academyId, materialId, submissionId, returnTo })).toBe(
      `/academy/${academyId}/learn/exercises/${materialId}` +
        `?submission=${submissionId}` +
        `&returnTo=${encodeURIComponent(returnTo)}`,
    );
  });
});
