'use client';

import type {
  ListPlatformUsersResult,
  UserLens,
  ResolvedListPlatformUsersInput,
} from '@cove/shared';
import {
  parsePlatformUsersQuery,
  userLensRoles,
  platformUsersResetsToFirstPage,
  serializePlatformUsersQuery,
} from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import { lensHrefs } from '../_lib/user-view';

export type PeopleQuery = ResolvedListPlatformUsersInput;

/**
 * The directory's state, held in the address.
 *
 * The same contract the academy people directory keeps, deliberately: an
 * operator moving between the two should find that a filtered view is a link
 * in both, and Back from an account returns to the page they were reading.
 *
 * Written with `replaceState`. Typing seven characters into the search box must
 * not put seven entries in the operator's history.
 */
export function usePlatformUsersState(lens: UserLens) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => withLens(parsePlatformUsersQuery(readAll(searchKey)), lens),
    [searchKey, lens],
  );

  const [query, setQuery] = React.useState<PeopleQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = peoplePath(lens, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback(
    (partial: Partial<PeopleQuery>) => {
      setQuery((current) => {
        const next = withLens({ ...current, ...partial }, lens);
        // Anything that changes *which* rows match sends the reader back to
        // page one. Staying on page 9 of a result that now has two pages is
        // the fastest way to make a working table look broken.
        return platformUsersResetsToFirstPage(current, next)
          ? { ...next, page: 1 }
          : next;
      });
    },
    [lens],
  );

  return { query, path, change };
}

/**
 * The lens's roles, imposed on whatever the address asked for.
 *
 * The lens is not a filter the operator can clear — it is which page they are
 * on — so it is applied after parsing rather than merged with it. A hand-edited
 * `?role=STUDENT` on the teachers page resolves to teachers, which is the
 * honest reading of a URL whose path already said so.
 */
function withLens(query: PeopleQuery, lens: UserLens): PeopleQuery {
  const roles = userLensRoles[lens];
  return roles.length > 0 ? { ...query, roles: [...roles] } : query;
}

export function peoplePath(lens: UserLens, query: PeopleQuery): string {
  // The lens's own roles never travel in the query string: the path already
  // carries them, and printing them twice makes a shared link that survives
  // one paste and not the next.
  const roles = userLensRoles[lens];
  const search = serializePlatformUsersQuery(
    roles.length > 0 ? { ...query, roles: [] } : query,
  );
  const base = lensHrefs[lens];
  return search ? `${base}?${search}` : base;
}

/**
 * One page of the directory.
 *
 * `keepPreviousData` keeps the rows on screen while the next page loads, marked
 * as pending, rather than the table emptying and refilling — which loses the
 * operator's place on every page turn.
 */
export function usePlatformUsersQuery(
  lens: UserLens,
  query: PeopleQuery,
  initialData: ListPlatformUsersResult | null,
  initialKey: string,
) {
  const key = serializePlatformUsersQuery(query);
  return useQuery({
    queryKey: ['platform-users', lens, key],
    queryFn: () => orpc.platformUsers.list(query),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/** Repeated parameters kept as arrays, which is how facets arrive. */
function readAll(search: string): Record<string, string | string[]> {
  const params = new URLSearchParams(search);
  const grouped: Record<string, string[]> = {};
  for (const [key, value] of params.entries()) {
    grouped[key] = [...(grouped[key] ?? []), value];
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => [
      key,
      values.length === 1 ? values[0]! : values,
    ]),
  );
}
