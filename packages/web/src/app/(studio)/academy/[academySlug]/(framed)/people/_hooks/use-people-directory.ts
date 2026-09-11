'use client';

import { routes } from '@/lib/routes';

import type { AcademyRole, ListPeopleInput, PeoplePage } from '@cove/shared';
import {
  parsePeopleQuery,
  resetsToFirstPage,
  serializePeopleQuery,
} from '@cove/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

import { useUrlTableQuery } from '../../_hooks/use-url-table-query';

export type PeopleQuery = Omit<ListPeopleInput, 'academyId'>;

/**
 * The directory's table state, held in the URL — §10. The mechanics are
 * `useUrlTableQuery`'s, shared with the Students and Staff rosters; what is
 * the directory's own is its reader, its writer, and its page-one rule.
 */
export function usePeopleDirectoryState() {
  const academySlug = useAcademySlug();
  return useUrlTableQuery<PeopleQuery>({
    basePath: routes.academyPeople(academySlug),
    parse: parsePeopleQuery,
    resetsToFirstPage: directoryResetsToFirstPage,
    serialize: serializePeopleQuery,
  });
}

/** §10's rule, on the query without its academy. */
function directoryResetsToFirstPage(
  previous: PeopleQuery,
  next: PeopleQuery,
): boolean {
  return resetsToFirstPage(
    { ...previous, academyId: '' },
    { ...next, academyId: '' },
  );
}

export function peoplePath(academySlug: string, query: PeopleQuery): string {
  const search = serializePeopleQuery(query);
  const base = routes.academyPeople(academySlug);
  return search ? `${base}?${search}` : base;
}

/**
 * One page of the directory.
 *
 * `keepPreviousData` keeps the rows in hand on screen while the next page
 * loads, marked as pending, rather than the table emptying and refilling —
 * which loses the reader's place on every page turn.
 */
export function usePeopleDirectoryQuery(
  academyId: string,
  query: PeopleQuery,
  initialData: PeoplePage | null,
  initialKey: string,
) {
  const key = serializePeopleQuery(query);
  return useQuery({
    queryKey: ['academy-people', academyId, key],
    queryFn: () => orpc.academyPeople.list({ academyId, ...query }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/** Roles a manager may filter by, in the vocabulary's own order. */
export const filterableRoles: readonly AcademyRole[] = [
  'STUDENT',
  'TEACHER',
  'TEAM_LEAD',
  'MANAGER',
];

/**
 * The three per-member changes a manager makes from the directory.
 *
 * Kept beside the query rather than in the components so all three invalidate
 * the same key: a role change that left the row on screen showing the old role
 * would be a page arguing with itself.
 *
 * The control tower is invalidated too. Its scale ledger counts roles and its
 * action queue counts suspended memberships, and a manager who suspends
 * somebody here and navigates back to a dashboard still counting them would be
 * right to distrust both pages.
 *
 * Bulk versions of all three are staged after this — §6.2 — and will call the
 * same endpoints through one atomic operation rather than looping these.
 */
export function usePeopleMutations(academyId: string) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['academy-people', academyId] }),
      // The rosters read the same memberships. A teacher suspended here must
      // not still read as active on Staff for the next fifteen seconds.
      queryClient.invalidateQueries({
        queryKey: ['academy-student-roster', academyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['academy-staff-roster', academyId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['academy-operations-overview', academyId],
      }),
    ]);

  const changeRole = useMutation({
    mutationFn: (input: { membershipId: string; role: AcademyRole }) =>
      orpc.academyMembers.changeRole({ academyId, ...input }),
    onSuccess: invalidate,
  });

  const grantRole = useMutation({
    mutationFn: (input: { membershipId: string; role: AcademyRole }) =>
      orpc.academyMembers.grantRole({ academyId, ...input }),
    onSuccess: invalidate,
  });

  const revokeRole = useMutation({
    mutationFn: (input: { membershipId: string; role: AcademyRole }) =>
      orpc.academyMembers.revokeRole({ academyId, ...input }),
    onSuccess: invalidate,
  });

  const suspend = useMutation({
    mutationFn: (membershipId: string) =>
      orpc.academyMembers.suspend({ academyId, membershipId }),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (membershipId: string) =>
      orpc.academyMembers.restore({ academyId, membershipId }),
    onSuccess: invalidate,
  });

  return {
    changeRole,
    grantRole,
    revokeRole,
    suspend,
    restore,
    pending:
      changeRole.isPending ||
      grantRole.isPending ||
      revokeRole.isPending ||
      suspend.isPending ||
      restore.isPending,
    error: changeRole.error ?? suspend.error ?? restore.error,
  };
}
