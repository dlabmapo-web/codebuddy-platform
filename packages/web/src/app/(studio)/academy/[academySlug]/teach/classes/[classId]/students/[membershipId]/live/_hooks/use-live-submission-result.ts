'use client';

import type { ResultChangedEvent, SubmissionResult, SubmissionStatus } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  initialLiveResultState,
  liveResultView,
  markedRead,
  readsReview,
  reviewAsSubmissionResult,
  withLatestSubmission,
  withMaterial,
  withResultEvent,
  type LiveResultView,
} from '../_lib/live-submission-result';

export type LiveSubmissionResult = {
  view: LiveResultView;
  submissionId: string | null;
  /** The verdict in the student's own result shape, once the review is read. */
  result: SubmissionResult | null;
  /** The socket's summary for this submission, shown while the review loads. */
  summary: ResultChangedEvent | null;
  problemTitle: string | null;
  createdAt: string | null;
  unread: boolean;
  retry: () => void;
};

/**
 * The student's latest submission on the exercise they are on, for the
 * teacher's result tab.
 *
 * The socket's `resultChanged` says a submission exists and how it stands; the
 * verdict is read through `teacherProgress.getSubmissionReview`, the same
 * authorized read the progress pages use, so what a hidden case shows is
 * decided in one place on the server. A teacher who arrives after the student
 * submitted starts from `latestSubmission` on the exercise context instead.
 */
export function useLiveSubmissionResult({
  academyId,
  classId,
  event,
  latest,
  materialId,
  membershipId,
  viewing,
}: {
  academyId: string;
  classId: string;
  event: ResultChangedEvent | null;
  latest: { submissionId: string; status: SubmissionStatus } | null;
  materialId: string | null;
  membershipId: string;
  /** Whether the result tab is on screen; what is on screen is not unread. */
  viewing: boolean;
}): LiveSubmissionResult {
  const [state, setState] = React.useState(initialLiveResultState);

  // Adjusted during render, React's pattern for state that follows props: an
  // effect would paint one frame of the previous exercise's verdict first.
  // Every step returns the same object when nothing changes, so this settles.
  let next = withMaterial(state, materialId);
  if (event) next = withResultEvent(next, event);
  next = withLatestSubmission(next, latest, materialId);
  if (viewing) next = markedRead(next);
  if (next !== state) setState(next);

  const current = next.current;
  const submissionId = current?.submissionId ?? null;
  const review = useQuery({
    queryKey: ['academy', academyId, 'live-submission-review', classId, membershipId, submissionId],
    queryFn: () =>
      orpc.teacherProgress.getSubmissionReview({
        academyId,
        classId,
        membershipId,
        submissionId: submissionId!,
      }),
    enabled: readsReview(current),
    // A graded submission never changes.
    staleTime: Infinity,
    retry: 1,
  });

  const loaded = Boolean(review.data && review.data.submissionId === submissionId);
  const view = liveResultView(current, {
    loading: review.isFetching,
    failed: review.isError,
    loaded,
  });

  return {
    view,
    submissionId,
    result:
      loaded && current && review.data
        ? reviewAsSubmissionResult(review.data, current.status)
        : null,
    summary: event && event.submissionId === submissionId ? event : null,
    problemTitle: loaded ? (review.data?.problemTitle ?? null) : null,
    createdAt: loaded ? (review.data?.createdAt ?? null) : null,
    unread: next.unread,
    retry: () => void review.refetch(),
  };
}
