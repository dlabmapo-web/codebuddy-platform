'use client';

import type { AcademyRole, ListPlatformApplicationsResult } from '@cove/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  applicationsPath,
  parseApplicationsQuery,
  serializeApplicationsQuery,
  type ApplicationsQuery,
} from '../_lib/applications-query';

/** The queue's own react-query prefix, so one review clears every reader. */
export const applicationsKey = ['platform-applications'] as const;

/** The address owns the filter, as it does on the users and content lists. */
export function useApplicationsState() {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseApplicationsQuery(searchKey),
    [searchKey],
  );
  const [query, setQuery] = React.useState<ApplicationsQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = applicationsPath(query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback((partial: Partial<ApplicationsQuery>) => {
    setQuery((current) => {
      const next = { ...current, ...partial };
      // Narrowing while on page 4 shows an empty table and reads as "nobody is
      // waiting" — the fastest way to make a working filter look broken.
      const narrowed =
        serializeApplicationsQuery({ ...current, page: 1 }) !==
        serializeApplicationsQuery({ ...next, page: 1 });
      return narrowed ? { ...next, page: 1 } : next;
    });
  }, []);

  return { query, path, change };
}

export function useApplicationsQuery(
  query: ApplicationsQuery,
  initialData: ListPlatformApplicationsResult | null | undefined,
  initialKey: string,
) {
  const key = serializeApplicationsQuery(query);
  return useQuery<ListPlatformApplicationsResult>({
    queryKey: [...applicationsKey, key],
    queryFn: () => orpc.platformApplications.list(query),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/**
 * Approving and rejecting, through the academy's own procedure.
 *
 * `academyJoinRequests.review` and not a platform twin: an operator already
 * passes `academy.applications.review` through the platform branch of
 * `AcademyAccessService`, so this is the same call a manager's own page makes,
 * with the same role ceiling and the same audit record. A second review
 * endpoint would be a second place for both to drift.
 *
 * Invalidating by the queue's prefix clears the table and the sidebar badge
 * together, without either knowing about the other.
 */
export function useApplicationReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | {
            academyId: string;
            requestId: string;
            decision: 'APPROVE';
            role: AcademyRole;
            reason?: string;
          }
        | {
            academyId: string;
            requestId: string;
            decision: 'REJECT';
            reason: string;
          },
    ) => orpc.academyJoinRequests.review(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: applicationsKey }),
  });
}

/**
 * How many applications only an operator can clear, for the sidebar badge.
 *
 * A suffix of the queue's own key, so the review mutation above clears this
 * count too — approving the last leaderless applicant empties the badge
 * without either file knowing about the other.
 *
 * No polling. An application is not urgent to the second, and a timer on a
 * layout that never unmounts is a request the operator pays for all day.
 */
export function usePendingApplicationsCount(): number {
  const { data } = useQuery({
    queryKey: [...applicationsKey, 'pending-count'],
    queryFn: () => orpc.platformApplications.pendingCount({}),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A badge that cannot load is a badge that is not drawn.
    retry: false,
  });
  return data?.count ?? 0;
}

export type { ApplicationsQuery };
