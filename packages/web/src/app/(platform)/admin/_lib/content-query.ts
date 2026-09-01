import type {
  ContentLens,
  ResolvedListPlatformContentInput,
} from '@cove/shared';
import { PLATFORM_CONTENT_PAGE_SIZE } from '@cove/shared';

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
  return {
    query: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    academyIds: params
      .getAll('academy')
      .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
      .slice(0, 50),
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
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

export function contentPath(lens: ContentLens, query: ContentQuery): string {
  const search = serializeContentQuery(query);
  const base = contentLensHrefs[lens];
  return search ? `${base}?${search}` : base;
}
