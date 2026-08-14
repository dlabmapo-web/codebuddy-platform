'use client';

import type { AcademyTeacherOverview } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  overviewPath,
  parseOverviewQuery,
  serializeOverviewQuery,
  withClassSelection,
  type OverviewQuery,
} from '../_lib/overview-url';

/**
 * The overview's one source of truth, and its one writer.
 *
 * The URL holds the state; this parses it, writes changes back with
 * `replaceState` so switching a filter does not push a history entry per click,
 * and adopts a real navigation — Back, or a shared link — when one happens.
 *
 * There is exactly one query. The page is a single claim about one period, and
 * fetching its regions separately would let the summary card, the chart beside
 * it, and the attention list below it describe three different moments.
 */
export function useOverviewState(academyId: string) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseOverviewQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  const [query, setQuery] = React.useState<OverviewQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = overviewPath(academyId, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  return {
    query,
    path,
    /**
     * Changing the class may invalidate the course, so the caller passes the
     * courses the response listed and a still-taught course survives.
     */
    change: React.useCallback(
      (
        partial: Partial<OverviewQuery>,
        courses: { value: string; classIds: string[] }[] = [],
      ) =>
        setQuery((current) => {
          const next = { ...current, ...partial };
          return partial.classId !== undefined
            ? withClassSelection(next, partial.classId, courses)
            : next;
        }),
      [],
    ),
  };
}

/**
 * The overview itself.
 *
 * `keepPreviousData` is what makes a filter change readable: the numbers in
 * hand stay on screen while the next scope loads, marked as updating, rather
 * than the page emptying and refilling. `initialData` is accepted only for the
 * exact state the server rendered — any other state fetches, so a shared link
 * never shows one query's rows under another query's filters.
 */
export function useTeacherOverviewQuery(
  academyId: string,
  query: OverviewQuery,
  initialData: AcademyTeacherOverview | null,
  initialKey: string,
) {
  const filters = serializeOverviewQuery(query);

  return useQuery({
    queryKey: ['academy-teacher-overview', academyId, filters],
    queryFn: () =>
      orpc.academyTeacherOverview.get({
        academyId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        range: query.range,
      }),
    initialData: filters === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    // The page is authorization-sensitive and cheap to re-read; a short window
    // keeps a teacher moving between tabs from re-querying on every focus.
    staleTime: 30_000,
    retry: false,
  });
}
