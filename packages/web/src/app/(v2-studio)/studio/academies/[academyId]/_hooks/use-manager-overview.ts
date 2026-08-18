'use client';

import type { ManagerOverview, OverviewRange } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import { managerRanges } from '../_lib/manager-view';

/**
 * The control tower's one source of truth, and its one writer.
 *
 * The URL holds the period; this reads it, writes changes back with
 * `replaceState` so switching a range does not push a history entry per click,
 * and adopts a real navigation — Back, or a shared link — when one happens.
 *
 * There is exactly one query for the whole page. §7.1 — the overview is a
 * single claim about a single instant, and fetching its regions separately
 * would let the scale ledger, the action queue, and the growth chart describe
 * three different moments while sitting on one screen.
 */
export function useManagerOverviewState(academyId: string) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlRange = React.useMemo(
    () => readRange(new URLSearchParams(searchKey).get('range')),
    [searchKey],
  );

  const [range, setRange] = React.useState<OverviewRange>(urlRange);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setRange(urlRange);
  }

  const path = managerOverviewPath(academyId, range);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  return { range, path, setRange };
}

/** The default period never appears in the address, so a shared link is bare. */
export function managerOverviewPath(
  academyId: string,
  range: OverviewRange,
): string {
  const base = `/studio/academies/${academyId}`;
  return range === DEFAULT_RANGE ? base : `${base}?range=${range}`;
}

/**
 * §9's default: thirty days.
 *
 * Wider than the teacher's seven. A teacher is asking what happened this week
 * in their classroom; a manager is asking whether the academy is growing, and
 * seven days of enrolments is noise at any size of school.
 */
export const DEFAULT_RANGE: OverviewRange = '30d';

/** Anything unsupported falls back rather than failing. §10, applied here. */
function readRange(value: string | null): OverviewRange {
  return managerRanges.find((range) => range === value) ?? DEFAULT_RANGE;
}

/**
 * The overview itself.
 *
 * `keepPreviousData` is what makes a period change readable: the numbers in
 * hand stay on screen while the next window loads, marked as updating, rather
 * than the page emptying and refilling. `initialData` is accepted only for the
 * exact range the server rendered — any other range fetches, so a shared link
 * never shows one period's totals under another period's label.
 */
export function useManagerOverviewQuery(
  academyId: string,
  range: OverviewRange,
  initialData: ManagerOverview | null,
  initialRange: OverviewRange,
) {
  return useQuery({
    queryKey: ['academy-operations-overview', academyId, range],
    queryFn: () => orpc.academyOperationsOverview.get({ academyId, range }),
    initialData: range === initialRange ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    // Authorization-sensitive and cheap to re-read; a short window keeps a
    // manager moving between tabs from re-querying on every focus.
    staleTime: 30_000,
    retry: false,
  });
}
