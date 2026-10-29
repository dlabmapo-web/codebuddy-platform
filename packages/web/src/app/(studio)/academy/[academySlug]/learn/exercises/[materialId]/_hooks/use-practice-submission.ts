'use client';
import {
  buildCaseCells,
  isTerminalStatus,
  submissionResultSchema,
  type SubmissionResult,
} from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { orpc } from '@/lib/orpc';
import { useLatestSubmission } from '@/components/workspace/use-latest-submission';

/** Practice has its own stream; bounded polling covers disconnects and older servers. */
export function usePracticeSubmission(
  academyId: string,
  materialId: string,
  preview = false,
  gradingRevision?: number,
  enabled = true,
  userId = '',
) {
  const client = useQueryClient();
  const latest = useLatestSubmission(
    { academyId, materialId, mode: 'staff-practice', preview, gradingRevision },
    userId,
    enabled,
  );
  const [submissionId, setId] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [selected, setSelected] = React.useState<SubmissionResult | null>(null);
  const [committed, setCommitted] = React.useState<SubmissionResult | null>(
    null,
  );
  const [polling, setPolling] = React.useState(false);
  const [totalCount, setTotalCount] = React.useState(0);
  const acceptedAt = React.useRef(0);
  const request = React.useRef<{ code: string; id: string } | null>(null);
  const generation = React.useRef(0);
  const selection = React.useRef(0);
  const busy = React.useRef(false);
  const stopStream = React.useRef<() => void>(() => {});
  const scope = JSON.stringify([
    userId,
    academyId,
    materialId,
    preview,
    gradingRevision,
    enabled,
  ]);
  const [trackedScope, setTrackedScope] = React.useState(scope);
  const currentScope = React.useRef(scope);
  if (trackedScope !== scope) {
    setTrackedScope(scope);
    setId(null);
    setSelected(null);
    setCommitted(null);
    setAccepting(false);
    setError(null);
    setTotalCount(0);
    setPolling(false);
  }
  const resultKey = [
    'staff-practice',
    userId,
    academyId,
    'result',
    submissionId,
  ];
  const result = useQuery({
    queryKey: resultKey,
    queryFn: () =>
      orpc.learn.getPracticeResult({ academyId, submissionId: submissionId! }),
    enabled: enabled && Boolean(submissionId),
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      !polling ||
      Date.now() - acceptedAt.current >= 120000 ||
      query.state.error ||
      committed ||
      (query.state.data && isTerminalStatus(query.state.data.status))
        ? false
        : 1000,
  });
  const live =
    committed?.submissionId === submissionId ? committed : result.data;
  const history = useQuery({
    queryKey: [
      'staff-practice',
      userId,
      academyId,
      materialId,
      preview,
      gradingRevision,
      'history',
    ],
    queryFn: () =>
      orpc.learn.listPracticeAttempts({
        academyId,
        materialId,
        preview,
        gradingRevision,
      }),
    enabled,
  });
  React.useEffect(() => {
    if (!enabled || !submissionId) return;
    const attemptGeneration = generation.current;
    let disposed = false;
    let source: EventSource | null = null;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const active = () =>
      !disposed &&
      generation.current === attemptGeneration &&
      currentScope.current === scope;
    const stop = () => {
      disposed = true;
      source?.close();
      clearTimeout(watchdog);
    };
    stopStream.current = stop;
    const fallback = () => {
      if (!active()) return;
      if (Date.now() - acceptedAt.current >= 120_000) {
        setPolling(false);
        stop();
        return;
      }
      clearTimeout(watchdog);
      setPolling(true);
      // Query is narrow and remains bounded by the original acceptance time.
      void client.refetchQueries({
        queryKey: ['staff-practice', userId, academyId, 'result', submissionId],
        exact: true,
      });
    };
    const touch = () => {
      clearTimeout(watchdog);
      if (active()) {
        setPolling(false);
        watchdog = setTimeout(fallback, 20_000);
      }
    };
    try {
      source = new EventSource(
        `/api/learn/practice-submissions/${encodeURIComponent(submissionId)}/stream?academyId=${encodeURIComponent(academyId)}`,
      );
      source.addEventListener('open', touch);
      source.addEventListener('ping', touch);
      source.addEventListener('result', (event) => {
        if (!active()) return;
        try {
          const parsed = submissionResultSchema.safeParse(
            JSON.parse((event as MessageEvent<string>).data),
          );
          if (
            !parsed.success ||
            parsed.data.submissionId !== submissionId ||
            parsed.data.materialId !== materialId
          ) {
            fallback();
            return;
          }
          touch();
          if (isTerminalStatus(parsed.data.status)) {
            // Keep the committed value separate so an older in-flight polling
            // response cannot replace it with RUNNING after the stream closes.
            setCommitted(parsed.data);
            setPolling(false);
            stop();
          }
        } catch {
          fallback();
        }
      });
      source.onerror = (event) => {
        // A network error can reconnect. A server refusal is terminal for this
        // stream; both paths recover through the same authorized narrow read.
        if (event instanceof MessageEvent) source?.close();
        fallback();
      };
      touch();
    } catch {
      fallback();
    }
    return stop;
  }, [academyId, client, enabled, materialId, scope, submissionId, userId]);

  React.useEffect(() => {
    if (live && isTerminalStatus(live.status)) {
      stopStream.current();
      busy.current = false;
      request.current = null;
      void client.invalidateQueries({
        queryKey: ['latest-submission', userId, academyId, materialId],
      });
      void client.invalidateQueries({
        queryKey: [
          'staff-practice',
          userId,
          academyId,
          materialId,
          preview,
          gradingRevision,
          'history',
        ],
      });
    }
  }, [academyId, client, materialId, preview, gradingRevision, live, userId]);
  const invalidateScope = React.useCallback(() => {
    generation.current++;
    selection.current++;
    busy.current = false;
    request.current = null;
    stopStream.current();
  }, []);
  React.useLayoutEffect(() => {
    currentScope.current = scope;
    return invalidateScope;
  }, [scope, invalidateScope]);

  const submit = async (code: string) => {
    if (!enabled || busy.current) return;
    busy.current = true;
    const action = ++generation.current;
    selection.current++;
    stopStream.current();
    setAccepting(true);
    setError(null);
    setSelected(null);
    setCommitted(null);
    setId(null);
    setPolling(false);
    // A lost admission acknowledgement retries this exact action; accepted
    // actions clear the key, so the next deliberate Submit gets a fresh one.
    request.current =
      request.current?.code === code
        ? request.current
        : { code, id: crypto.randomUUID() };
    try {
      const accepted = await orpc.learn.submitPractice({
        academyId,
        materialId,
        code,
        preview,
        gradingRevision,
        requestId: request.current.id,
      });
      if (generation.current !== action || currentScope.current !== scope)
        return;
      request.current = null;
      acceptedAt.current = Date.now();
      setTotalCount(accepted.totalCount);
      setId(accepted.submissionId);
      void client.invalidateQueries({
        queryKey: ['latest-submission', userId, academyId, materialId],
      });
    } catch (caught) {
      if (generation.current === action && currentScope.current === scope) {
        setError(caught);
        busy.current = false;
      }
    } finally {
      if (generation.current === action && currentScope.current === scope)
        setAccepting(false);
    }
  };
  const value = selected ?? live ?? null;
  return {
    submit,
    submissionId,
    result: value,
    refreshSummary: () => {
      void latest.refetch();
    },
    summaryRefreshing: latest.isFetching,
    latestSubmission: latest.data,
    summaryLoading: enabled && latest.isPending,
    summaryError: latest.isError,
    submitting:
      accepting ||
      Boolean(
        submissionId &&
          !result.error &&
          (!live || !isTerminalStatus(live.status)),
      ),
    error: error ?? (committed ? null : result.error),
    cells: buildCaseCells({
      totalCount: value?.totalCount ?? totalCount,
      reported: value?.cases ?? [],
    }),
    reset: () => {
      invalidateScope();
      setId(null);
      setError(null);
      setSelected(null);
      setCommitted(null);
      setTotalCount(0);
      setAccepting(false);
      setPolling(false);
    },
    history: history.data?.attempts ?? [],
    select: async (id: string) => {
      const action = generation.current,
        selectedAction = ++selection.current;
      try {
        const fetched = await orpc.learn.getPracticeResult({
          academyId,
          submissionId: id,
        });
        if (
          generation.current === action &&
          selection.current === selectedAction &&
          currentScope.current === scope
        )
          setSelected(fetched);
      } catch (caught) {
        if (
          generation.current === action &&
          selection.current === selectedAction &&
          currentScope.current === scope
        )
          setError(caught);
      }
    },
  };
}
