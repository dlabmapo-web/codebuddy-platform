'use client';
import { buildCaseCells, isTerminalStatus, type SubmissionResult } from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { orpc } from '@/lib/orpc';

/** Polling is bounded and cancelled on unmount; it never opens student SSE or monitoring. */
export function usePracticeSubmission(academyId: string, materialId: string, preview = false, gradingRevision?: number, enabled = true) {
  const client = useQueryClient();
  const [submissionId, setId] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [selected, setSelected] = React.useState<SubmissionResult | null>(null);
  const [totalCount, setTotalCount] = React.useState(0);
  const request = React.useRef<{ code: string; id: string } | null>(null);
  const result = useQuery({
    queryKey: ['staff-practice', academyId, 'result', submissionId],
    queryFn: () => orpc.learn.getPracticeResult({ academyId, submissionId: submissionId! }),
    enabled: Boolean(submissionId), retry: 1,
    refetchInterval: (query) => query.state.error || (query.state.data && isTerminalStatus(query.state.data.status)) ? false : 1000,
  });
  const history = useQuery({
    queryKey: ['staff-practice', academyId, materialId, preview, 'history'],
    queryFn: () => orpc.learn.listPracticeAttempts({ academyId, materialId, preview }),
    enabled,
  });
  React.useEffect(() => {
    if (result.data && isTerminalStatus(result.data.status)) {
      void client.invalidateQueries({ queryKey: ['staff-practice', academyId, materialId, preview, 'history'] });
    }
  }, [academyId, client, materialId, preview, result.data]);
  const submit = async (code: string) => {
    if (accepting || (result.data && !isTerminalStatus(result.data.status))) return;
    setAccepting(true); setError(null); setSelected(null); setId(null);
    // Preserve this key after an uncertain response; changing code creates a new request.
    request.current = request.current?.code === code ? request.current : { code, id: crypto.randomUUID() };
    try {
      const accepted = await orpc.learn.submitPractice({ academyId, materialId, code, preview, gradingRevision, requestId: request.current.id });
      setTotalCount(accepted.totalCount); setId(accepted.submissionId);
    } catch (caught) { setError(caught); }
    finally { setAccepting(false); }
  };
  const value = selected ?? result.data ?? null;
  React.useEffect(() => {
    if (result.data && isTerminalStatus(result.data.status)) request.current = null;
  }, [result.data]);
  return {
    submit, submissionId, result: value,
    submitting: accepting || Boolean(submissionId && !result.error && (!result.data || !isTerminalStatus(result.data.status))),
    error: error ?? result.error,
    cells: buildCaseCells({ totalCount: value?.totalCount ?? totalCount, reported: value?.cases ?? [] }),
    reset: () => { setId(null); setError(null); setSelected(null); setTotalCount(0); },
    history: history.data?.attempts ?? [],
    select: async (id: string) => {
      try { setSelected(await orpc.learn.getPracticeResult({ academyId, submissionId: id })); }
      catch (caught) { setError(caught); }
    },
  };
}
