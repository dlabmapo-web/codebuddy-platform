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
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

export type PeopleQuery = Omit<ListPeopleInput, 'academyId'>;

/**
 * The directory's table state, held in the URL.
 *
 * §10 — page, size, search, filters, sort, and direction all live in the
 * address, so a manager can send "suspended teachers, by join date" to a
 * colleague and Back from a member's profile returns to the page they were on
 * rather than to a reset table.
 *
 * Changes are written with `replaceState`. Typing seven characters into the
 * search box must not put seven entries in the reader's history, and Back from
 * this page should leave it rather than walk backwards through their own
 * keystrokes.
 *
 * Anything unparseable falls back to a default rather than failing. The query
 * string is user-editable text arriving from bookmarks, chat messages, and
 * previous versions of this page; §10 makes an invalid address a page, never an
 * error.
 */
export function usePeopleDirectoryState(academyId: string) {
  const academySlug = useAcademySlug();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parsePeopleQuery(Object.fromEntries(readAll(searchKey))),
    [searchKey],
  );

  const [query, setQuery] = React.useState<PeopleQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = peoplePath(academySlug, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback((partial: Partial<PeopleQuery>) => {
    setQuery((current) => {
      const next = { ...current, ...partial };
      // §10 — anything that changes *which* rows match sends the reader back to
      // page one. Staying on page 9 of a result that now has two pages is the
      // fastest way to make a working table look broken.
      return resetsToFirstPage(
        { ...current, academyId: '' } as ListPeopleInput,
        { ...next, academyId: '' } as ListPeopleInput,
      )
        ? { ...next, page: 1 }
        : next;
    });
  }, []);

  return { query, path, change };
}

export function peoplePath(academySlug: string, query: PeopleQuery): string {
  const search = serializePeopleQuery(query);
  const base = `${routes.academy(academySlug)}/people`;
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

/** Repeated parameters kept as arrays, which is how filters arrive. */
function readAll(search: string): [string, string | string[]][] {
  const params = new URLSearchParams(search);
  const grouped = new Map<string, string[]>();
  for (const [key, value] of params.entries()) {
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return [...grouped.entries()].map(([key, values]) => [
    key,
    values.length === 1 ? values[0] : values,
  ]);
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
      queryClient.invalidateQueries({
        queryKey: ['academy-operations-overview', academyId],
      }),
    ]);

  const changeRole = useMutation({
    mutationFn: (input: { membershipId: string; role: AcademyRole }) =>
      orpc.academyMembers.changeRole({ academyId, ...input }),
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
    suspend,
    restore,
    pending:
      changeRole.isPending || suspend.isPending || restore.isPending,
    error: changeRole.error ?? suspend.error ?? restore.error,
  };
}
