'use client';

import { routes } from '@/lib/routes';

import type { OverviewRange, TeamLeadOverview } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

import { leadRanges } from '../_lib/lead-view';

/**
 * The curriculum overview's one source of truth, and its one writer.
 *
 * The URL holds the period; this reads it, writes changes back with
 * `replaceState` so switching a range does not push a history entry per click,
 * and adopts a real navigation — Back, or a shared link — when one happens.
 *
 * There is exactly one query for the whole page. §8 — the overview is a single
 * claim about a single instant, and fetching its regions separately would let
 * the catalog, the blockers, and the effectiveness panel describe three
 * different moments while sitting on one screen.
 */
export function useLeadOverviewState(academyId: string) {
  const academySlug = useAcademySlug();
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

  const path = leadOverviewPath(academySlug, range);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  return { range, path, setRange };
}

/** The default period never appears in the address, so a shared link is bare. */
export function leadOverviewPath(
  academySlug: string,
  range: OverviewRange,
): string {
  const base = `${routes.academy(academySlug)}`;
  return range === DEFAULT_RANGE ? base : `${base}?range=${range}`;
}

/**
 * §8's default: thirty days.
 *
 * The manager's rather than the teacher's seven. A teacher is asking what
 * happened this week in their classroom; a Team Lead is asking whether a
 * curriculum works, and a week of submissions is noise on a course that takes
 * a term to teach.
 */
export const DEFAULT_RANGE: OverviewRange = '30d';

/** Anything unsupported falls back rather than failing. */
function readRange(value: string | null): OverviewRange {
  return leadRanges.find((range) => range === value) ?? DEFAULT_RANGE;
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
export function useLeadOverviewQuery(
  academyId: string,
  range: OverviewRange,
  initialData: TeamLeadOverview | null,
  initialRange: OverviewRange,
) {
  return useQuery({
    queryKey: ['academy-curriculum-overview', academyId, range],
    queryFn: () => orpc.academyCurriculumOverview.get({ academyId, range }),
    initialData: range === initialRange ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}
