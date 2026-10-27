'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { LatestSubmission } from '@cove/shared';

function denied(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: number; code?: string };
  return [401, 403, 404].includes(value.status ?? 0) || ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(value.code ?? '');
}
const order = (a: LatestSubmission, b: LatestSubmission) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.submissionId.localeCompare(b.submissionId);
export function submissionPollInterval(latest: LatestSubmission | null | undefined, now: number, failures = 0, error?: unknown): number | false {
  if (denied(error)) return false;
  if (latest && !['PENDING', 'AWAITING_REVIEW'].includes(latest.status)) return false;
  if (latest?.status === 'PENDING' && now - Date.parse(latest.createdAt) >= 120000) return false;
  if (failures) return failures <= 3 ? 1000 * 2 ** failures : false;
  if (latest?.status === 'AWAITING_REVIEW') return 15000;
  return latest?.status === 'PENDING' ? 1000 : false;
}

/** Shared polling policy. Query keys retain owner, class, role and revision scope. */
export function useSubmissionStatus(options: {
  queryKey: QueryKey; read: (signal: AbortSignal) => Promise<LatestSubmission | null>;
  enabled: boolean; seed?: LatestSubmission | null; onTerminal?: () => void;
}) {
  const client = useQueryClient(), key = JSON.stringify(options.queryKey);
  const failures = useRef({ key, count: 0 });
  const observed = useRef<{ key: string; value?: LatestSubmission | null }>({ key, value: options.seed });
  const query = useQuery({
    queryKey: options.queryKey, enabled: options.enabled, retry: false, staleTime: 0,
    initialData: options.seed,
    queryFn: async ({ signal }) => {
      if (failures.current.key !== key) failures.current = { key, count: 0 };
      try {
        const value = await options.read(signal);
        if (failures.current.key === key) failures.current.count = 0;
        const current = client.getQueryData<LatestSubmission | null>(options.queryKey);
        // A response begun before a new acceptance cannot replace its summary.
        if (current && (!value || order(value, current) < 0)) return current;
        return value;
      } catch (error) {
        if (!signal.aborted && failures.current.key === key) failures.current.count++;
        throw error;
      }
    },
    refetchOnWindowFocus: query => !denied(query.state.error),
    refetchIntervalInBackground: false,
    refetchInterval: query => submissionPollInterval(query.state.data, Date.now(), failures.current.key === key ? failures.current.count : 0, query.state.error),
  });
  const { refetch } = query;
  const onTerminal = options.onTerminal;
  useEffect(() => {
    if (!options.enabled || !options.seed) return;
    const seed = options.seed, current = client.getQueryData<LatestSubmission | null>(options.queryKey);
    const newer = !current || (current.submissionId !== seed.submissionId && order(seed, current) > 0);
    const completed = current?.submissionId === seed.submissionId && ['PENDING', 'AWAITING_REVIEW'].includes(current.status) && !['PENDING', 'AWAITING_REVIEW'].includes(seed.status);
    if (newer || completed) {
      // A full workspace response may already contain a committed grade. Cancel
      // an older status read without rolling the newer cache value back.
      void client.cancelQueries({ queryKey: options.queryKey, exact: true }, { revert: false });
      observed.current = { key, value: seed };
      client.setQueryData(options.queryKey, seed);
      if (newer) void refetch();
    }
  }, [client, key, options.enabled, options.queryKey, options.seed, refetch]);
  useEffect(() => {
    const previous = observed.current, value = query.data;
    if (value === undefined) return;
    if (previous.key === key && previous.value && value && order(value, previous.value) < 0) return;
    observed.current = { key, value };
    if (previous.key === key && previous.value && value?.submissionId === previous.value.submissionId &&
        ['PENDING', 'AWAITING_REVIEW'].includes(previous.value.status) && !['PENDING', 'AWAITING_REVIEW'].includes(value.status)) onTerminal?.();
  }, [key, query.data, onTerminal]);
  return query;
}
