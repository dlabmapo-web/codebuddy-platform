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
  classId,
  materialId,
  initialResult = null,
  solveSessionId,
  reopenSolveSession,
}: {
  academyId: string;
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
  const [submitting, setSubmitting] = React.useState(false);
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [reported, setReported] = React.useState<ReportedCase[]>([]);
  const [result, setResult] = React.useState<SubmissionResult | null>(
    initialResult,
  );
  const [error, setError] = React.useState<unknown>(null);

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
    setTrackedResultId(initialResult?.submissionId ?? null);
    setResult(initialResult);
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

  React.useEffect(() => teardown, [teardown]);

  const loadResult = React.useCallback(
    async (id: string) => {
      try {
        const fetched = await orpc.learn.getSubmission({
          academyId,
          submissionId: id,
        });
        if (!isTerminalStatus(fetched.status)) return false;
        setResult(fetched);
        setSubmitting(false);
        teardown();
        // The verdict moves progress, so the outline and catalog are stale.
        void queryClient.invalidateQueries({ queryKey: ['learn', academyId] });
        return true;
      } catch (caught) {
        setError(caught);
        setSubmitting(false);
        teardown();
        return true;
      }
    },
    [academyId, queryClient, teardown],
  );

  const submit = React.useCallback(
    async (code: string) => {
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
          ...(solveSessionId ? { solveSessionId } : {}),
        });
      } catch (caught) {
        // An expired or mismatched sitting is not the student's problem: open
        // a fresh one and retry once, so a tab left open overnight costs them
        // a moment rather than the submission.
        if (isSolveSessionInvalid(caught) && reopenSolveSession) {
          const reopened = await reopenSolveSession();
          try {
            accepted = await orpc.learn.submit({
              academyId,
              classId,
              materialId,
              code,
              ...(reopened ? { solveSessionId: reopened.solveSessionId } : {}),
            });
          } catch (retried) {
            setError(retried);
            setSubmitting(false);
            return;
          }
        } else {
          setError(caught);
          setSubmitting(false);
          return;
        }
      }

      setSubmissionId(accepted.submissionId);
      setTotalCount(accepted.totalCount);

      // The stream is proxied through the web app: `EventSource` cannot set an
      // Authorization header, and the session cookie only works same-origin.
      const source = new EventSource(
        `/api/learn/submissions/${accepted.submissionId}/stream?academyId=${academyId}`,
      );
      sourceRef.current = source;

      source.addEventListener('progress', (event) => {
        const payload = submissionProgressEventSchema.safeParse(
          JSON.parse((event as MessageEvent<string>).data),
        );
        if (!payload.success) return;
        setReported((current) => [
          ...current.filter((item) => item.position !== payload.data.position),
          payload.data,
        ]);
        fallbackRef.current?.touch();
      });

      source.addEventListener('result', () => {
        void loadResult(accepted.submissionId);
      });

      source.onerror = (event) => {
        if (event instanceof MessageEvent) {
          setError(new Error('GRADING_UNAVAILABLE'));
          setSubmitting(false);
          teardown();
        }
        // Do not tear down: `EventSource` reconnects on its own, and the
        // fallback below covers the case where it never recovers.
      };

      fallbackRef.current = createSubmissionFallback(
        () => void loadResult(accepted.submissionId),
        FALLBACK_AFTER_MS,
      );
      fallbackRef.current.touch();
    },
    [
      academyId,
      classId,
      loadResult,
      materialId,
      reopenSolveSession,
      solveSessionId,
      teardown,
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
    submit,
    submitting,
    submissionId,
    result,
    error,
    cells,
    reset: () => {
      teardown();
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
  const code = (error as { code?: unknown; data?: { code?: unknown } }).code
    ?? (error as { data?: { code?: unknown } }).data?.code;
  return code === 'SOLVE_SESSION_INVALID';
}

export type SubmissionState = ReturnType<typeof useSubmission>;
