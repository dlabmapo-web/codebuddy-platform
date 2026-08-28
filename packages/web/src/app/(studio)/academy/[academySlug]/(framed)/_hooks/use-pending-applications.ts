'use client';

import { useQuery } from '@tanstack/react-query';

import { orpc } from '@/lib/orpc';

/**
 * How many applicants are waiting, for the nav badge.
 *
 * The key is a suffix of the applications page's own
 * `['academy', academyId, 'applications']`, which is the whole reason it is
 * shaped this way: react-query invalidates by prefix, so the review mutation
 * already in `use-applications-manager` clears this count too. Approving the
 * last applicant empties the badge without either file knowing about the
 * other, where a key of its own would leave a manager looking at a nav that
 * still wants three people reviewed.
 *
 * `enabled` rather than a caller-side branch: a Student and a Teacher hold no
 * review permission, and asking would earn them a 403 on every page entry.
 *
 * Refetched when the tab regains focus, which is the moment this number is
 * most likely to have moved — somebody left the studio open, a person signed
 * up meanwhile, and the answer arrives as they come back. There is no polling
 * interval: an application is not urgent to the second, and a timer on a
 * layout that never unmounts is a request every academy pays for all day.
 */
export function usePendingApplicationsCount(
  academyId: string,
  enabled: boolean,
): number {
  const { data } = useQuery({
    queryKey: ['academy', academyId, 'applications', 'pending-count'],
    queryFn: () => orpc.academyJoinRequests.pendingCount({ academyId }),
    enabled,
    // Long enough that moving between studio pages does not re-ask, short
    // enough that a badge is never a stale claim for a whole session.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    // A badge that cannot load is a badge that is not drawn. Retrying a
    // permission failure on every navigation would cost more than the number
    // is worth.
    retry: false,
  });

  return data?.count ?? 0;
}
