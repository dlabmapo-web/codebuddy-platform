'use client';

import type {
  ClassPointsBoard,
  ListPlatformRankingResult,
  PointsPeriodKind,
} from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  parseRankingQuery,
  rankingListInput,
  rankingListKey,
  rankingPath,
  serializeRankingQuery,
  type RankingQuery,
} from '../_lib/ranking-query';

/** The address owns the state, as it does on every other console list. */
export function useRankingState() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseRankingQuery(searchKey),
    [searchKey],
  );
  const [query, setQuery] = React.useState<RankingQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    // A real navigation — Back, or a shared link. Adopt it.
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = rankingPath(query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      // `replaceState`, so switching period four times does not leave Back
      // walking through four of them.
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback((partial: Partial<RankingQuery>) => {
    setQuery((current) => {
      const next = { ...current, ...partial };
      // Narrowing while on page 4 shows an empty table and reads as "there are
      // none" — the fastest way to make a working filter look broken. The open
      // board is excluded from the comparison: selecting a class is not a
      // narrowing and must not send the operator back to page 1.
      const narrowed =
        rankingListKey({ ...current, page: 1 }) !==
        rankingListKey({ ...next, page: 1 });
      return narrowed ? { ...next, page: 1 } : next;
    });
  }, []);

  return { query, path, change };
}

export function useRankingQuery(
  query: RankingQuery,
  initialData: ListPlatformRankingResult | null | undefined,
  initialKey: string,
) {
  const key = rankingListKey(query);
  return useQuery<ListPlatformRankingResult>({
    queryKey: ['platform-ranking', key],
    queryFn: () => orpc.platformRanking.classes(rankingListInput(query)),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/**
 * One class's board, through the academy's own procedure.
 *
 * `points.getClassBoard` and not a platform twin: an operator already passes
 * `academy.read` through the platform branch of `AcademyAccessService`, so this
 * is the same call the manager's own ranking page makes, against the same
 * query, returning the same rows. A second implementation is the one thing a
 * ranking must never have.
 *
 * Disabled until a class is chosen, so an unopened board costs no request.
 */
export function useClassBoardQuery(
  academyId: string | null,
  classId: string | null,
  period: PointsPeriodKind,
) {
  return useQuery<ClassPointsBoard>({
    queryKey: ['platform-class-board', academyId, classId, period],
    queryFn: () =>
      orpc.points.getClassBoard({
        academyId: academyId!,
        classId: classId!,
        period,
      }),
    enabled: Boolean(academyId && classId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}

export { serializeRankingQuery, type RankingQuery };
