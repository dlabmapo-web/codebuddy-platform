'use client';

import type { StudentAcademyOverview } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

import {
  parseStudentOverviewQuery,
  serializeStudentOverviewQuery,
  studentOverviewPath,
  type StudentOverviewQuery,
} from '../_lib/student-overview-url';

/**
 * The overview's one source of truth, and its one writer.
 *
 * The URL holds the period and the standing class; this reads them, writes
 * changes back with `replaceState` so switching a range does not push a
 * history entry per click, and adopts a real navigation — Back, or a shared
 * link — when one happens.
 *
 * There is exactly one query for the whole page. §10.1 — the overview is a
 * single claim about a single instant, and fetching its sections separately
 * would let the ledger, the chart, and the standing describe three different
 * moments while sitting on one screen.
 */
export function useStudentOverviewState(academyId: string) {
  const academySlug = useAcademySlug();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseStudentOverviewQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  const [query, setQuery] = React.useState<StudentOverviewQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = studentOverviewPath(academySlug, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback(
    (partial: Partial<StudentOverviewQuery>) =>
      setQuery((current) => ({ ...current, ...partial })),
    [],
  );

  return { query, change };
}

/**
 * The overview itself.
 *
 * `keepPreviousData` is what makes a period change readable: the numbers in
 * hand stay on screen while the next window loads, marked as updating, rather
 * than the page emptying and refilling. `initialData` is accepted only for the
 * exact state the server rendered — any other state fetches, so a shared link
 * never shows one period's numbers under another period's label.
 */
export function useStudentOverviewQuery(
  academyId: string,
  query: StudentOverviewQuery,
  initialData: StudentAcademyOverview | null,
  initialKey: string,
) {
  const key = serializeStudentOverviewQuery(query);
  return useQuery({
    queryKey: ['student-overview', academyId, key],
    queryFn: () =>
      orpc.learn.getOverview({
        academyId,
        range: query.range,
        ...(query.standingClassId
          ? { standingClassId: query.standingClassId }
          : {}),
      }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}
