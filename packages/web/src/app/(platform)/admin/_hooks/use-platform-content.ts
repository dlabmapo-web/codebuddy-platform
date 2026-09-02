'use client';

import type {
  ContentLens,
  ListPlatformClassesResult,
  ListPlatformCoursesResult,
  ListPlatformProblemsResult,
  PlatformContentSummary,
} from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  contentPath,
  contentSummaryKey,
  parseContentQuery,
  serializeContentQuery,
  type ContentQuery,
} from '../_lib/content-query';

/** One page of any lens. Every field the table reads is common to all three. */
export type ContentPage =
  | ListPlatformCoursesResult
  | ListPlatformClassesResult
  | ListPlatformProblemsResult;

export function useContentSummaryQuery(
  academyIds: string[] | undefined,
  initialData: PlatformContentSummary | null | undefined,
  initialKey: string,
) {
  const key = contentSummaryKey(academyIds);
  return useQuery<PlatformContentSummary>({
    queryKey: ['platform-content-summary', key],
    queryFn: () => orpc.platformContent.summary({ academyIds }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/** The address owns the filter, as it does on the users directory. */
export function useContentState(lens: ContentLens) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseContentQuery(searchKey),
    [searchKey],
  );
  const [query, setQuery] = React.useState<ContentQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = contentPath(lens, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback((partial: Partial<ContentQuery>) => {
    setQuery((current) => {
      const next = { ...current, ...partial };
      // Narrowing while on page 9 shows an empty table and reads as "no
      // results" — the fastest way to make a working filter look broken.
      const narrowed =
        serializeContentQuery({ ...current, page: 1 }) !==
        serializeContentQuery({ ...next, page: 1 });
      return narrowed ? { ...next, page: 1 } : next;
    });
  }, []);

  return { query, path, change };
}

/**
 * One page of one lens.
 *
 * The three lenses are three endpoints returning three row shapes. The union
 * is widened at the boundary rather than threaded through the table, because
 * the table already narrows on `lens` to choose its columns — carrying a
 * discriminant in the payload as well would be the same decision made twice.
 */
export function useContentQuery(
  lens: ContentLens,
  query: ContentQuery,
  initialData: ContentPage | null | undefined,
  initialKey: string,
) {
  const key = serializeContentQuery(query);
  return useQuery<ContentPage>({
    queryKey: ['platform-content', lens, key],
    queryFn: async () =>
      lens === 'courses'
        ? await orpc.platformContent.courses(query)
        : lens === 'classes'
          ? await orpc.platformContent.classes(query)
          : await orpc.platformContent.problems(query),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

export type { ContentQuery };
