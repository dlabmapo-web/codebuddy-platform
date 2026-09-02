import type {
  JoinRequestStatus,
  PlatformApplicationSortKey,
  ResolvedListPlatformApplicationsInput,
} from '@cove/shared';
import {
  joinRequestStatuses,
  platformApplicationSortKeys,
  PLATFORM_APPLICATIONS_PAGE_SIZE,
} from '@cove/shared';

export type ApplicationsQuery = ResolvedListPlatformApplicationsInput;

/**
 * The applications queue's state, read out of the address.
 *
 * Pure and separate from the hook beside it, for the reason the content
 * browser's is: the server renders the first page and has to parse the same
 * query string the client will, and a `'use client'` module cannot be called
 * from the server.
 *
 * Anything unparseable falls back to a default. A query string is user-editable
 * text arriving from bookmarks and chat messages, so an invalid address is a
 * page rather than an error — and `sort` in particular reaches an `orderBy`.
 */
export function parseApplicationsQuery(search: string): ApplicationsQuery {
  const params = new URLSearchParams(search);
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const sort = params.get('sort') ?? '';
  const direction = params.get('dir') ?? '';
  return {
    query: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    academyIds: params
      .getAll('academy')
      .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
      .slice(0, 50),
    statuses: params
      .getAll('status')
      .filter((value): value is JoinRequestStatus =>
        (joinRequestStatuses as readonly string[]).includes(value),
      )
      .slice(0, 4),
    leaderlessOnly: params.get('needs') === '1' || undefined,
    sort: (platformApplicationSortKeys as readonly string[]).includes(sort)
      ? (sort as PlatformApplicationSortKey)
      : 'waiting',
    direction: direction === 'desc' ? 'desc' : 'asc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PLATFORM_APPLICATIONS_PAGE_SIZE,
  };
}

/**
 * The same state as a query string, with every default omitted.
 *
 * The defaults have to serialize to nothing, or the server-rendered
 * `initialKey` never matches the client's and the first paint refetches a page
 * it was just handed.
 */
export function serializeApplicationsQuery(query: ApplicationsQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set('q', query.query);
  for (const id of [...(query.academyIds ?? [])].sort()) {
    params.append('academy', id);
  }
  for (const status of [...(query.statuses ?? [])].sort()) {
    params.append('status', status);
  }
  if (query.leaderlessOnly) params.set('needs', '1');
  if (query.sort !== 'waiting') params.set('sort', query.sort);
  if (query.direction !== 'asc') params.set('dir', query.direction);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}

export function applicationsPath(query: ApplicationsQuery): string {
  const search = serializeApplicationsQuery(query);
  return search ? `/admin/applications?${search}` : '/admin/applications';
}
