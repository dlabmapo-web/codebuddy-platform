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
  materialId,
}: {
  academyId: string;
  materialId: string;
}) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = React.useState(false);
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const [reported, setReported] = React.useState<ReportedCase[]>([]);
  const [result, setResult] = React.useState<SubmissionResult | null>(null);
  const [error, setError] = React.useState<unknown>(null);

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
        accepted = await orpc.learn.submit({ academyId, materialId, code });
      } catch (caught) {
        setError(caught);
        setSubmitting(false);
        return;
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
    [academyId, loadResult, materialId, teardown],
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
      setResult(null);
      setReported([]);
      setError(null);
    },
  };
}

export type SubmissionState = ReturnType<typeof useSubmission>;
