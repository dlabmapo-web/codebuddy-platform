'use client';

import {
  buildCaseCells,
  isTerminalStatus,
  submissionProgressEventSchema,
  type CaseOutcome,
  type SubmissionResult,
} from '@cove/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { orpc } from '@/lib/orpc';
import { useLatestSubmission } from '@/components/workspace/use-latest-submission';

import {
  createSubmissionFallback,
  type SubmissionFallback,
} from '../_lib/submission-fallback';

/**
 * The one fallback. If the stream never delivers — a dropped connection, a
 * proxy that buffers — a single fetch closes it out. Deliberately not a loop:
 * v1 polled up to 400 times per submission.
 */
const FALLBACK_AFTER_MS = 15_000;

type ReportedCase = {
  position: number;
  outcome: CaseOutcome;
  isSample: boolean;
};

export function useSubmission({
  academyId,
  userId,
  classId,
  materialId,
  initialResult = null,
  solveSessionId,
  reopenSolveSession,
}: {
  academyId: string;
  userId: string;
  classId: string;
  materialId: string;
  /**
   * A historical attempt's verdict, shown until this sitting produces one.
   *
   * Entering from Answer records opens the Result tab on the attempt the
   * student chose to review, exactly as it read when they submitted it.
   */
  initialResult?: SubmissionResult | null;
  /** The sitting this attempt belongs to; the server owns its elapsed time. */
  solveSessionId?: string | null;
  /** Opens a fresh sitting after the server rejected the current one. */
  reopenSolveSession?: () => Promise<{ solveSessionId: string } | null>;
}) {
  const queryClient = useQueryClient();
  const latest = useLatestSubmission(
    { academyId, materialId, classId, mode: 'student' },
    userId,
  );
  const initialPending =
    initialResult && !isTerminalStatus(initialResult.status)
      ? initialResult
      : null;
  const [submitting, setSubmitting] = React.useState(Boolean(initialPending));
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [reported, setReported] = React.useState<ReportedCase[]>([]);
  const [result, setResult] = React.useState<SubmissionResult | null>(
    initialPending ? null : initialResult,
  );
  const [error, setError] = React.useState<unknown>(null);
  const generation = React.useRef(0);
  const busy = React.useRef(false);
  const request = React.useRef<{ code: string; id: string } | null>(null);
  const activeId = React.useRef<string | null>(null);
  const scope = JSON.stringify([academyId, userId, classId, materialId]);
  const currentScope = React.useRef(scope);
  const [trackedScope, setTrackedScope] = React.useState(scope);
  if (trackedScope !== scope) {
    setTrackedScope(scope);
    setResult(initialPending ? null : initialResult);
    setReported([]);
    setError(null);
    setSubmitting(false);
    setSubmissionId(null);
    setTotalCount(0);
  }

  /**
   * Previous/Next swaps the exercise without remounting, so a selected
   * historical verdict has to stop describing the workspace the moment it
   * stops being the one it belongs to. Adjusting during render is React's
   * documented pattern; an effect would paint the old verdict for a frame.
   */
  const [trackedResultId, setTrackedResultId] = React.useState(
    initialResult?.submissionId ?? null,
  );
  if (trackedResultId !== (initialResult?.submissionId ?? null)) {
    setSubmitting(false);
    setSubmissionId(null);
    setTotalCount(0);
    setTrackedResultId(initialResult?.submissionId ?? null);
    setResult(initialPending ? null : initialResult);
    setReported([]);
    setError(null);
  }

  const sourceRef = React.useRef<EventSource | null>(null);
  const fallbackRef = React.useRef<SubmissionFallback | null>(null);

  const teardown = React.useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    fallbackRef.current?.cancel();
    fallbackRef.current = null;
  }, []);

  const invalidateScope = React.useCallback(() => {
    generation.current++;
    busy.current = false;
    activeId.current = null;
    request.current = null;
    teardown();
  }, [teardown]);
  React.useLayoutEffect(() => {
    currentScope.current = scope;
    return invalidateScope;
  }, [invalidateScope, scope, initialResult?.submissionId]);

  const loadResult = React.useCallback(
    async (id: string) => {
      const action = generation.current;
      const active = () =>
        generation.current === action &&
        activeId.current === id &&
        currentScope.current === scope;
      if (!active()) return true;
      try {
        const fetched = await orpc.learn.getSubmission({
          academyId,
          submissionId: id,
        });
        if (!active()) return true;
        if (!isTerminalStatus(fetched.status)) return false;
        busy.current = false;
        setResult(fetched);
        setSubmitting(false);
        teardown();
        // The verdict moves progress, so the outline and catalog are stale.
        void queryClient.invalidateQueries({ queryKey: ['learn', academyId] });
        void queryClient.invalidateQueries({
          queryKey: ['latest-submission', userId, academyId, materialId],
        });
        return true;
      } catch (caught) {
        if (!active()) return true;
        busy.current = false;
        setError(caught);
        setSubmitting(false);
        teardown();
        return true;
      }
    },
    [academyId, queryClient, teardown, userId, materialId, scope],
  );

  const watch = React.useCallback(
    (id: string, count: number, action: number) => {
      const active = () =>
        generation.current === action && currentScope.current === scope;
      teardown();
      activeId.current = id;
      busy.current = true;
      setSubmitting(true);
      setSubmissionId(id);
      setTotalCount(count);
      setResult(null);
      setReported([]);
      setError(null);
      // The stream is proxied through the web app: `EventSource` cannot set an
      // Authorization header, and the session cookie only works same-origin.
      const source = new EventSource(
        `/api/learn/submissions/${id}/stream?academyId=${academyId}`,
      );
      sourceRef.current = source;

      source.addEventListener('progress', (event) => {
        if (!active()) return;
        let data: unknown;
        try {
          data = JSON.parse((event as MessageEvent<string>).data);
        } catch {
          return;
        }
        const payload = submissionProgressEventSchema.safeParse(data);
        if (!payload.success) return;
        setReported((current) => [
          ...current.filter((item) => item.position !== payload.data.position),
          payload.data,
        ]);
        fallbackRef.current?.touch();
      });

      source.addEventListener('result', () => {
        if (!active()) return;
        void loadResult(id);
      });

      source.onerror = (event) => {
        if (!active()) return;
        if (event instanceof MessageEvent) {
          busy.current = false;
          setError(new Error('GRADING_UNAVAILABLE'));
          setSubmitting(false);
          teardown();
        }
        // Do not tear down: `EventSource` reconnects on its own, and the
        // fallback below covers the case where it never recovers.
      };

      fallbackRef.current = createSubmissionFallback(
        () => void loadResult(id),
        FALLBACK_AFTER_MS,
      );
      fallbackRef.current.touch();
    },
    [academyId, loadResult, scope, teardown],
  );

  // An owned pending attempt selected by the normal Submit URL resumes result
  // observation only. Reloading never resubmits accepted code or mints an action.
  const pendingId = initialPending?.submissionId;
  const pendingCount = initialPending?.totalCount ?? 0;
  React.useEffect(() => {
    if (!pendingId) return;
    watch(pendingId, pendingCount, ++generation.current);
    return teardown;
  }, [pendingId, pendingCount, scope, watch, teardown]);

  const submit = React.useCallback(
    async (code: string) => {
      if (busy.current) return;
      busy.current = true;
      const action = ++generation.current;
      activeId.current = null;
      const active = () =>
        generation.current === action && currentScope.current === scope;
      request.current =
        request.current?.code === code
          ? request.current
          : { code, id: crypto.randomUUID() };
      const requestId = request.current.id;
      teardown();
      setSubmitting(true);
      setResult(null);
      setReported([]);
      setError(null);

      let accepted: { submissionId: string; totalCount: number };
      try {
        accepted = await orpc.learn.submit({
          academyId,
          classId,
          materialId,
          code,
          requestId,
          ...(solveSessionId ? { solveSessionId } : {}),
        });
      } catch (caught) {
        if (!active()) return;
        // An expired or mismatched sitting is not the student's problem: open
        // a fresh one and retry once, so a tab left open overnight costs them
        // a moment rather than the submission.
        if (isSolveSessionInvalid(caught) && reopenSolveSession) {
          try {
            const reopened = await reopenSolveSession();
            if (!active()) return;
            accepted = await orpc.learn.submit({
              academyId,
              classId,
              materialId,
              code,
              requestId,
              ...(reopened ? { solveSessionId: reopened.solveSessionId } : {}),
            });
          } catch (retried) {
            if (!active()) return;
            busy.current = false;
            setError(retried);
            setSubmitting(false);
            return;
          }
        } else {
          busy.current = false;
          setError(caught);
          setSubmitting(false);
          return;
        }
      }

      if (!active()) return;
      request.current = null;
      const location = new URL(window.location.href);
      if (location.pathname.endsWith(`/learn/exercises/${materialId}`)) {
        location.searchParams.set('submission', accepted.submissionId);
        window.history.replaceState(null, '', location);
      }
      watch(accepted.submissionId, accepted.totalCount, action);
      void queryClient.invalidateQueries({
        queryKey: ['latest-submission', userId, academyId, materialId],
      });
    },
    [
      academyId,
      classId,
      materialId,
      queryClient,
      reopenSolveSession,
      solveSessionId,
      scope,
      teardown,
      userId,
      watch,
    ],
  );

  const cells = React.useMemo(
    () =>
      buildCaseCells({
        totalCount: result?.totalCount ?? totalCount,
        reported: result
          ? result.cases.map((item) => ({
              position: item.position,
              outcome: item.outcome,
              isSample: item.isSample,
            }))
          : reported,
      }),
    [reported, result, totalCount],
  );

  return {
    refreshSummary: () => {
      void latest.refetch();
    },
    summaryRefreshing: latest.isFetching,
    latestSubmission: latest.data,
    summaryLoading: latest.isPending,
    summaryError: latest.isError,
    submit,
    submitting,
    submissionId,
    result,
    error,
    cells,
    reset: () => {
      invalidateScope();
      setSubmitting(false);
      setSubmissionId(null);
      setTotalCount(0);
      // Back to nothing, not back to the historical verdict: a transition has
      // left the attempt this workspace was opened on.
      setResult(null);
      setTrackedResultId(null);
      setReported([]);
      setError(null);
    },
  };
}

/** The one refusal a submit may recover from by opening a fresh sitting. */
function isSolveSessionInvalid(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code =
    (error as { code?: unknown; data?: { code?: unknown } }).code ??
    (error as { data?: { code?: unknown } }).data?.code;
  return code === 'SOLVE_SESSION_INVALID';
}

export type SubmissionState = ReturnType<typeof useSubmission>;
