'use client';

import { useSearchParams } from 'next/navigation';
import * as React from 'react';

/**
 * A server-paged table's state, held in the URL.
 *
 * Page, size, search, filters, sort, and direction all live in the address,
 * so a manager can send "suspended teachers, by join date" to a colleague and
 * Back from a member's profile returns to the page they were on rather than to
 * a reset table. Shared by Members, Students, and Staff, which each supply
 * their own reader, writer, and "does this change which rows match" rule.
 *
 * Changes are written with `replaceState`. Typing seven characters into the
 * search box must not put seven entries in the reader's history, and Back from
 * the page should leave it rather than walk backwards through their own
 * keystrokes.
 *
 * Anything unparseable falls back to a default rather than failing — that is
 * the reader's job, and every reader in `@cove/shared` does it.
 */
export function useUrlTableQuery<TQuery extends { page: number }>({
  basePath,
  parse,
  resetsToFirstPage,
  serialize,
}: {
  basePath: string;
  parse: (params: Record<string, string | string[] | undefined>) => TQuery;
  resetsToFirstPage: (previous: TQuery, next: TQuery) => boolean;
  serialize: (query: TQuery) => string;
}) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parse(Object.fromEntries(readAll(searchKey))),
    [parse, searchKey],
  );

  const [query, setQuery] = React.useState<TQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const search = serialize(query);
  const path = search ? `${basePath}?${search}` : basePath;
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  const change = React.useCallback(
    (partial: Partial<TQuery>) => {
      setQuery((current) => {
        const next = { ...current, ...partial };
        // Anything that changes *which* rows match sends the reader back to
        // page one. Staying on page 9 of a result that now has two pages is
        // the fastest way to make a working table look broken.
        return resetsToFirstPage(current, next) ? { ...next, page: 1 } : next;
      });
    },
    [resetsToFirstPage],
  );

  return { query, path, change };
}

/**
 * The search box's text, typed locally and pushed to the query on a pause, so
 * a manager typing "kim" makes one request rather than three.
 *
 * The box adopts the URL during render rather than from an effect. A Back
 * navigation changes the query while the reader is not typing, and syncing it
 * after paint would show the previous search in the box for one frame — on a
 * control the reader is looking straight at.
 */
export function useDebouncedSearch(
  search: string,
  commit: (search: string) => void,
) {
  const [input, setInput] = React.useState(search);
  const [adopted, setAdopted] = React.useState(search);
  if (adopted !== search) {
    setAdopted(search);
    setInput(search);
  }

  React.useEffect(() => {
    if (input === search) return;
    const timer = window.setTimeout(() => commit(input), 300);
    return () => window.clearTimeout(timer);
  }, [commit, input, search]);

  return [input, setInput] as const;
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
    values.length === 1 ? values[0]! : values,
  ]);
}
