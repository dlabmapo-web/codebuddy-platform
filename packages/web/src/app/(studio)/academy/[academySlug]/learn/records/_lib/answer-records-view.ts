import { routes } from '@/lib/routes';
import {
  answerRecordOutlineNumber,
  solveDurationParts,
  type AnswerRecordResult,
  type AnswerRecordRow,
} from '@cove/shared';

/**
 * How a record row reads, decided away from the markup.
 *
 * The rules that matter here are the ones a reviewer has to be able to check
 * without a browser: a judge fault never reads as a wrong answer, and an
 * unrecorded solve time never reads as zero.
 */

/**
 * Tone per result. Every badge also carries its own text, so colour is
 * reinforcement rather than the carrier of the verdict.
 */
export const recordResultTones: Record<AnswerRecordResult, string> = {
  ACCEPTED: 'bg-success/10 text-success',
  NOT_ACCEPTED: 'bg-danger/10 text-danger',
  // Deliberately neither success nor danger: a system fault is not a grade.
  JUDGE_ERROR: 'bg-warning/10 text-warning',
  CANCELLED: 'bg-retired-soft text-retired',
  IN_PROGRESS: 'bg-brand-soft text-brand',
};

/**
 * The shape a solve time is printed in, or its absence.
 *
 * Returns a discriminated choice rather than a string so the locale decides
 * the words: "1h 02m" and "1시간 2분" are the same fact.
 */
export type SolveTimeDisplay =
  | { kind: 'missing' }
  | { kind: 'hours'; hours: number; minutes: number }
  | { kind: 'minutes'; minutes: number; seconds: number }
  | { kind: 'seconds'; seconds: number };

export function solveTimeDisplay(
  solveElapsedSec: number | null,
): SolveTimeDisplay {
  const parts = solveDurationParts(solveElapsedSec);
  // Never recorded, because the attempt predates solve sessions. An em dash
  // and a spoken "not recorded" — not a zero that reads as instant work.
  if (!parts) return { kind: 'missing' };
  if (parts.hours > 0) {
    return { kind: 'hours', hours: parts.hours, minutes: parts.minutes };
  }
  if (parts.minutes > 0) {
    return { kind: 'minutes', minutes: parts.minutes, seconds: parts.seconds };
  }
  return { kind: 'seconds', seconds: parts.seconds };
}

/** `1-2-3 · Course › Module › Lecture`, as the Problem cell prints it. */
export function recordPathSegments(row: AnswerRecordRow): {
  number: string | null;
  path: string[];
} {
  return {
    number: answerRecordOutlineNumber(row),
    path: [row.courseTitle, row.moduleTitle, row.lectureTitle],
  };
}

/**
 * Where Review goes: the ordinary exercise route, carrying the attempt and the
 * exact table state to come back to.
 */
export function reviewHref(input: {
  academySlug: string;
  materialId: string;
  submissionId: string;
  returnTo: string;
}): string {
  return routes.academyLearnExercise(input.academySlug, input.materialId, {
    submission: input.submissionId,
    returnTo: input.returnTo,
  });
}
