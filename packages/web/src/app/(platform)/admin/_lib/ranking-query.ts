import type {
  PointsPeriodKind,
  RankingSortKey,
  ResolvedListPlatformRankingInput,
} from '@cove/shared';
import {
  PLATFORM_RANKING_PAGE_SIZE,
  pointsPeriodKinds,
  rankingSortDirections,
  rankingSortKeys,
} from '@cove/shared';

export const RANKING_PATH = '/admin/ranking';

/**
 * The ranking page's state, read out of the address.
 *
 * Pure and separate from the hook beside it, for the reason `content-query.ts`
 * gives: the server renders the first page and has to parse the same query
 * string the client will, and a `'use client'` module cannot be called from
 * the server.
 *
 * Anything unparseable falls back to a default. A query string is user-editable
 * text arriving from bookmarks and chat messages, so an invalid address is a
 * page rather than an error.
 */
export type RankingQuery = ResolvedListPlatformRankingInput & {
  /**
   * The class whose board is open beneath the table, and the academy it
   * belongs to.
   *
   * Both, because `points.getClassBoard` is scoped by academy and the board has
   * to be loadable from a cold link without first finding the class in the
   * table.
   */
  classId: string | null;
  academyId: string | null;
};

const UUID = /^[0-9a-f-]{36}$/i;

export function parseRankingQuery(search: string): RankingQuery {
  const params = new URLSearchParams(search);
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const sort = params.get('sort') ?? '';
  const direction = params.get('dir') ?? '';
  const period = params.get('period') ?? '';
  const classId = params.get('class') ?? '';
  const academyId = params.get('academy') ?? '';

  return {
    query: (params.get('q') ?? '').trim().slice(0, 120) || undefined,
    academyIds: params
      .getAll('in')
      .filter((value) => UUID.test(value))
      .slice(0, 50),
    period: (pointsPeriodKinds as readonly string[]).includes(period)
      ? (period as PointsPeriodKind)
      : 'day',
    sort: (rankingSortKeys as readonly string[]).includes(sort)
      ? (sort as RankingSortKey)
      : 'points',
    direction: (rankingSortDirections as readonly string[]).includes(direction)
      ? (direction as 'asc' | 'desc')
      : 'desc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: PLATFORM_RANKING_PAGE_SIZE,
    classId: UUID.test(classId) ? classId : null,
    academyId: UUID.test(academyId) ? academyId : null,
  };
}

/**
 * The same state as a query string, with every default omitted.
 *
 * An untouched table and a default-sorted table have to serialize identically
 * or `initialKey` never matches on first paint and the server's page is thrown
 * away.
 *
 * The academy **facet** is `in`; the academy the open board belongs to is
 * `academy`. Two different questions — which academies the table shows, and
 * which one the board is from — and collapsing them would make selecting a
 * class silently filter the table under it.
 */
export function serializeRankingQuery(query: RankingQuery): string {
  const params = new URLSearchParams();
  if (query.query) params.set('q', query.query);
  for (const id of [...(query.academyIds ?? [])].sort()) params.append('in', id);
  if (query.period !== 'day') params.set('period', query.period);
  if (query.sort !== 'points') params.set('sort', query.sort);
  if (query.direction !== 'desc') params.set('dir', query.direction);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.classId) params.set('class', query.classId);
  if (query.academyId) params.set('academy', query.academyId);
  return params.toString();
}

export function rankingPath(query: RankingQuery): string {
  const search = serializeRankingQuery(query);
  return search ? `${RANKING_PATH}?${search}` : RANKING_PATH;
}

/**
 * What the list endpoint is asked for, without the board's selection.
 *
 * The open class is page state, not a filter: sending it would narrow the
 * table to the one row the operator just opened. Stripping it here rather than
 * at the call site keeps the react-query key and the request built from one
 * value.
 */
export function rankingListInput(
  query: RankingQuery,
): ResolvedListPlatformRankingInput {
  return {
    query: query.query,
    academyIds: query.academyIds,
    period: query.period,
    sort: query.sort,
    direction: query.direction,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** The list request's identity, for the query key and the server's handoff. */
export function rankingListKey(query: RankingQuery): string {
  return serializeRankingQuery({
    ...query,
    classId: null,
    academyId: null,
  });
}
