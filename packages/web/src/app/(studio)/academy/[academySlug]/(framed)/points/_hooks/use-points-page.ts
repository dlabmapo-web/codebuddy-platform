'use client';

import type { PointsPage } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePathname, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  parsePointsQuery,
  serializePointsQuery,
  type PointsQuery,
} from '../_lib/points-url';

/**
 * The page's one source of truth, and its one writer.
 *
 * The URL holds the period and the class; this hook parses it, asks the server
 * for that view, and writes changes back with `replaceState` so switching
 * between 오늘 and 이번 주 does not push a history entry per tap and leave Back
 * walking through them.
 *
 * `keepPreviousData` is what makes a period change not blank the board: the
 * rows in hand stay on screen, dimmed, until the next set arrives. On a page
 * whose whole point is a number moving, a flash of empty reads as a loss.
 */
export function usePointsPage({
  academyId,
  initialData,
}: {
  academyId: string;
  initialData: PointsPage | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parsePointsQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  // The address is authoritative, but a tap on 이번 주 has to move the control
  // before the query resolves, so the chosen value lives here in between.
  const [query, setQuery] = React.useState<PointsQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    // A real navigation happened — Back, or a shared link. Adopt it.
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const result = useQuery({
    queryKey: ['points', academyId, query.period, query.classId],
    queryFn: () =>
      orpc.points.getPage({
        academyId,
        period: query.period,
        ...(query.classId ? { classId: query.classId } : {}),
      }),
    // Only the first render matches the state the server rendered for.
    initialData:
      initialData &&
      initialData.period.kind === query.period &&
      (query.classId === null ||
        (initialData.leaderboard?.eligible === true &&
          initialData.leaderboard.classId === query.classId))
        ? initialData
        : undefined,
    placeholderData: keepPreviousData,
    // A student solving a problem in another tab should see this move without
    // a reload, but not so often that the number twitches while they read.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const update = React.useCallback(
    (next: Partial<PointsQuery>) => {
      const merged = { ...query, ...next };
      setQuery(merged);
      const nextSearch = serializePointsQuery(merged);
      setUrlKey(nextSearch.replace(/^\?/, ''));
      window.history.replaceState(null, '', `${pathname}${nextSearch}`);
    },
    [pathname, query],
  );

  return { data: result.data ?? null, query, result, update };
}
