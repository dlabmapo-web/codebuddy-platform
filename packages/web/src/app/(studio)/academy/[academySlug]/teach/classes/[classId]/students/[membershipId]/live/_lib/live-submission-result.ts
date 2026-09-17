import {
  isTerminalStatus,
  type ResultChangedEvent,
  type SubmissionResult,
  type SubmissionStatus,
  type TeacherSubmissionReview,
} from '@cove/shared';

/**
 * Which of the student's submissions the teacher's result tab is about.
 *
 * The socket only says *that* a submission exists and how it stands; the
 * verdict itself is read through the authorized review. This is the state
 * that decides which review to read and when, kept pure so every transition
 * can be tested without a socket or a query client.
 */
export type TrackedSubmission = {
  submissionId: string;
  materialId: string;
  status: SubmissionStatus;
};

export type LiveResultState = {
  /** The exercise the student is on; results for any other are not shown. */
  materialId: string | null;
  current: TrackedSubmission | null;
  /** A new submission or verdict arrived that the teacher has not opened. */
  unread: boolean;
  /**
   * Submissions this tab has moved past. A late packet for one of them — the
   * acceptance of an older attempt arriving after a newer verdict — must not
   * take the tab back.
   */
  superseded: readonly string[];
};

export const initialLiveResultState: LiveResultState = {
  materialId: null,
  current: null,
  unread: false,
  superseded: [],
};

const SUPERSEDED_LIMIT = 20;

/** QUEUED < RUNNING < any verdict; a verdict never goes back to grading. */
function progress(status: SubmissionStatus): number {
  if (status === 'QUEUED') return 0;
  if (status === 'RUNNING') return 1;
  return 2;
}

/** The student is on another exercise now; what was shown no longer applies. */
export function withMaterial(
  state: LiveResultState,
  materialId: string | null,
): LiveResultState {
  if (state.materialId === materialId) return state;
  return {
    ...state,
    materialId,
    current:
      state.current && state.current.materialId === materialId
        ? state.current
        : null,
    unread:
      state.current && state.current.materialId === materialId
        ? state.unread
        : false,
  };
}

/** A `resultChanged` for this watch. */
export function withResultEvent(
  state: LiveResultState,
  event: Pick<ResultChangedEvent, 'submissionId' | 'materialId' | 'status'>,
): LiveResultState {
  if (event.materialId !== state.materialId) return state;
  if (state.superseded.includes(event.submissionId)) return state;

  const current = state.current;
  if (current?.submissionId === event.submissionId) {
    if (progress(event.status) <= progress(current.status)) return state;
    return {
      ...state,
      current: { ...current, status: event.status },
      unread: true,
    };
  }

  return {
    ...state,
    current: {
      submissionId: event.submissionId,
      materialId: event.materialId,
      status: event.status,
    },
    unread: true,
    superseded: current
      ? [...state.superseded, current.submissionId].slice(-SUPERSEDED_LIMIT)
      : state.superseded,
  };
}

/**
 * The latest submission the server knew of when the watch opened.
 *
 * Only fills an empty tab: anything the socket has already said is newer. It
 * does not mark the tab unread, because it is not news — it is what was there
 * before the teacher arrived.
 */
export function withLatestSubmission(
  state: LiveResultState,
  latest: { submissionId: string; status: SubmissionStatus } | null,
  materialId: string | null,
): LiveResultState {
  if (!latest || !materialId || materialId !== state.materialId) return state;
  if (state.current || state.superseded.includes(latest.submissionId)) return state;
  return {
    ...state,
    current: { submissionId: latest.submissionId, materialId, status: latest.status },
  };
}

export function markedRead(state: LiveResultState): LiveResultState {
  return state.unread ? { ...state, unread: false } : state;
}

export type LiveResultView =
  | 'empty'
  | 'grading'
  | 'loading'
  | 'result'
  | 'fault'
  | 'cancelled'
  | 'error';

/** What the tab shows, given the tracked submission and how its review read is going. */
export function liveResultView(
  current: TrackedSubmission | null,
  review: { loading: boolean; failed: boolean; loaded: boolean },
): LiveResultView {
  if (!current) return 'empty';
  if (!isTerminalStatus(current.status)) return 'grading';
  if (current.status === 'ERRORED') return 'fault';
  if (current.status === 'CANCELLED') return 'cancelled';
  if (review.loaded) return 'result';
  if (review.failed) return 'error';
  return 'loading';
}

/** Whether the review should be read for this submission yet. */
export function readsReview(current: TrackedSubmission | null): boolean {
  return (
    current !== null &&
    isTerminalStatus(current.status) &&
    current.status !== 'ERRORED' &&
    current.status !== 'CANCELLED'
  );
}

/**
 * The teacher's review in the shape the student's result components read.
 *
 * Nothing is added: the cases are the review's cases, so a hidden case has no
 * input, expected output, or actual output here either. Fields the result
 * components never read, and a review does not carry, are neutral.
 */
export function reviewAsSubmissionResult(
  review: TeacherSubmissionReview,
  status: SubmissionStatus,
): SubmissionResult {
  return {
    submissionId: review.submissionId,
    materialId: review.materialId,
    status,
    passedCount: review.passedCount,
    totalCount: review.totalCount,
    score: review.score,
    runtimeMs: review.runtimeMs,
    failureReason: null,
    elapsedSec: review.solveElapsedSec ?? 0,
    attemptCount: 0,
    createdAt: review.createdAt,
    gradedAt: null,
    cases: review.cases.map((item) => ({
      position: item.position,
      isSample: item.isSample,
      outcome: item.outcome,
      runtimeMs: item.runtimeMs,
      input: item.isSample ? item.input : null,
      expectedOutput: item.isSample ? item.expectedOutput : null,
      actualOutput: item.isSample ? item.actualOutput : null,
    })),
  };
}
