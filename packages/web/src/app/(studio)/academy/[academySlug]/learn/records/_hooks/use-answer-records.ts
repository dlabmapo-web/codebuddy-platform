'use client';

import type { AnswerRecordsResult } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

import {
  parseRecordsQuery,
  recordsPath,
  serializeRecordsQuery,
  withRecordsPage,
  withRecordsQueryChange,
  type RecordsQuery,
} from '../_lib/records-url';

/** A pause in typing, not the gap between two words. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The records table's one source of truth, and its one writer.
 *
 * The URL holds the state; this hook parses it, asks the server for that page,
 * and writes changes back. Two rules are worth naming:
 *
 * The address is updated with `replaceState` rather than `router.replace`, so
 * paging does not push a history entry per click and Back leaves the page
 * rather than walking every page the reader visited. `returnTo` restores the
 * position instead.
 *
 * `keepPreviousData` is what makes a page turn not blank the table: the rows
 * in hand stay on screen, dimmed, until the next page arrives.
 */
export function useAnswerRecords({
  academyId,
  initialData,
}: {
  academyId: string;
  initialData: AnswerRecordsResult | null;
}) {
  const academySlug = useAcademySlug();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseRecordsQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  // The address is authoritative, but the search box has to stay responsive
  // while a reader types, so the typed value lives here until it settles.
  const [query, setQuery] = React.useState<RecordsQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    // A real navigation happened — Back, or a shared link. Adopt it.
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const [debouncedSearch, setDebouncedSearch] = React.useState(query.q);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query.q]);

  // Everything but the search box applies at once; only `q` waits.
  const effective: RecordsQuery = React.useMemo(
    () => ({ ...query, q: debouncedSearch }),
    [debouncedSearch, query],
  );
  const effectiveKey = serializeRecordsQuery(effective);
  const nextPath = recordsPath(academySlug, effective);

  React.useEffect(() => {
    if (nextPath !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', nextPath);
    }
  }, [nextPath]);

  const records = useQuery({
    queryKey: ['learn', academyId, 'records', effectiveKey],
    queryFn: () =>
      orpc.learn.listAnswerRecords({
        academyId,
        ...(effective.q ? { q: effective.q } : {}),
        ...(effective.results.length ? { results: effective.results } : {}),
        ...(effective.classIds.length ? { classIds: effective.classIds } : {}),
        ...(effective.courseIds.length ? { courseIds: effective.courseIds } : {}),
        ...(effective.moduleIds.length ? { moduleIds: effective.moduleIds } : {}),
        ...(effective.lectureIds.length
          ? { lectureIds: effective.lectureIds }
          : {}),
        ...(effective.sort
          ? { sort: effective.sort, direction: effective.direction }
          : {}),
        page: effective.page,
      }),
    // Only the state the server page was rendered for; any change fetches.
    initialData:
      initialData && effectiveKey === serializeRecordsQuery(urlQuery)
        ? initialData
        : undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const change = React.useCallback(
    (partial: Partial<Omit<RecordsQuery, 'page'>>) =>
      setQuery((current) => withRecordsQueryChange(current, partial)),
    [],
  );

  return {
    /** What the controls render from, including the still-typing search. */
    query,
    data: records.data ?? null,
    /** Only a failure with nothing to show is the page's error state. */
    failed: records.isError,
    pending: records.isFetching,
    retry: () => void records.refetch(),
    change,
    setPage: (page: number) =>
      setQuery((current) => withRecordsPage(current, page)),
    reset: () =>
      setQuery((current) =>
        withRecordsQueryChange(current, {
          q: '',
          results: [],
          classIds: [],
          courseIds: [],
          moduleIds: [],
          lectureIds: [],
        }),
      ),
    /** The exact address a Review link should carry as `returnTo`. */
    returnTo: nextPath,
  };
}

export type AnswerRecordsState = ReturnType<typeof useAnswerRecords>;
