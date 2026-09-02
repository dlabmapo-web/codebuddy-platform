import type {
  ContentLens,
  ContentSortKey,
  ResolvedListPlatformContentInput,
} from '@cove/shared';
import {
  contentSortDirections,
  contentSortKeys,
  PLATFORM_CONTENT_PAGE_SIZE,
} from '@cove/shared';

import { contentLensHrefs } from './content-view';

export type ContentQuery = ResolvedListPlatformContentInput;

/**
 * The content browser's state, read out of the address.
 *
 * Deliberately not in the hook beside it: the server renders the first page
 * and has to parse the same query string the client will, and a `'use client'`
 * module cannot be called from the server. Keeping these pure and separate is
 * what lets one definition serve both.
 *
 * Anything unparseable falls back to a default. A query string is user-editable
 * text arriving from bookmarks and chat messages, so an invalid address is a
 * page rather than an error.
 */
export function parseContentQuery(search: string): ContentQuery {
  const params = new URLSearchParams(search);
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const sort = params.get('sort') ?? '';
  const direction = params.get('dir') ?? '';
  return {
    query: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    academyIds: params
      .getAll('academy')
      .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
      .slice(0, 50),
    sort: (contentSortKeys as readonly string[]).includes(sort)
      ? (sort as ContentSortKey)
      : 'updatedAt',
    direction: (contentSortDirections as readonly string[]).includes(direction)
      ? (direction as 'asc' | 'desc')
      : 'desc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PLATFORM_CONTENT_PAGE_SIZE,
  };
}

/** The same state as a query string, with every default omitted. */
export function serializeContentQuery(query: ContentQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set('q', query.query);
  for (const id of [...(query.academyIds ?? [])].sort()) {
    params.append('academy', id);
  }
  // Newest-first is what the table opens on, so it is the one ordering the
  // address stays silent about — an unsorted URL and a default-sorted URL have
  // to serialize identically or `initialKey` never matches on first paint.
  if (query.sort !== 'updatedAt') params.set('sort', query.sort);
  if (query.direction !== 'desc') params.set('dir', query.direction);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

export function contentPath(lens: ContentLens, query: ContentQuery): string {
  const search = serializeContentQuery(query);
  const base = contentLensHrefs[lens];
  return search ? `${base}?${search}` : base;
}

/**
 * Academy scope follows a lens switch; search, sort and paging do not.
 *
 * The sort is dropped for the same reason the search text is: `students` means
 * nothing on the courses lens, and a key the new lens cannot honour silently
 * becomes newest-first — an ordering the operator did not ask for and cannot
 * see they are being given.
 */
export function queryForContentLens(query: ContentQuery): ContentQuery {
  return {
    ...query,
    query: undefined,
    sort: 'updatedAt',
    direction: 'desc',
    page: 1,
  };
}

export function contentSummaryKey(academyIds?: string[]) {
  return [...(academyIds ?? [])].sort().join(',');
}
