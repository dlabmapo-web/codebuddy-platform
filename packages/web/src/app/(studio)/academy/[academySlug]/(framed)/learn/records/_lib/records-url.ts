import { routes } from '@/lib/routes';
import {
  answerRecordResults,
  answerRecordSortKeys,
  sortDirections,
  type AnswerRecordResult,
  type AnswerRecordSort,
  type SortDirection,
} from '@cove/shared';

/**
 * The URL is the records table's shareable source of truth.
 *
 * Parsing is total: anything unsupported is discarded rather than refused, so
 * a hand-edited or stale address normalizes into a table that renders instead
 * of a page that fails. Serializing is canonical — one table state produces
 * exactly one URL — which is what lets `returnTo` restore a reader's exact
 * position without a scroll store.
 *
 * See §6.5 of the student answer records design.
 */

export type RecordsQuery = {
  q: string;
  results: AnswerRecordResult[];
  classIds: string[];
  courseIds: string[];
  moduleIds: string[];
  lectureIds: string[];
  sort: AnswerRecordSort | null;
  direction: SortDirection;
  page: number;
};

export const emptyRecordsQuery: RecordsQuery = {
  q: '',
  results: [],
  classIds: [],
  courseIds: [],
  moduleIds: [],
  lectureIds: [],
  sort: null,
  direction: 'desc',
  page: 1,
};

/** Emitted in this order, always, so equivalent states share one address. */
const parameterOrder = [
  'q',
  'result',
  'class',
  'course',
  'module',
  'lecture',
  'sort',
  'direction',
  'page',
] as const;

/** A UUID, and only that: the ids in this URL are all curriculum keys. */
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecordsQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): RecordsQuery {
  const search =
    params instanceof URLSearchParams ? params : toSearchParams(params);

  const sort = search.get('sort');
  const direction = search.get('direction');
  const validSort = answerRecordSortKeys.find((key) => key === sort) ?? null;

  return {
    q: (search.get('q') ?? '').trim(),
    results: unique(
      search
        .getAll('result')
        .filter((value): value is AnswerRecordResult =>
          (answerRecordResults as readonly string[]).includes(value),
        ),
    ),
    classIds: unique(search.getAll('class').filter(isId)),
    courseIds: unique(search.getAll('course').filter(isId)),
    moduleIds: unique(search.getAll('module').filter(isId)),
    lectureIds: unique(search.getAll('lecture').filter(isId)),
    sort: validSort,
    // A direction without a sort orders nothing, so the default stands until
    // a supported column is chosen.
    direction:
      validSort && sortDirections.find((value) => value === direction)
        ? (direction as SortDirection)
        : validSort
          ? 'asc'
          : 'desc',
    page: parsePage(search.get('page')),
  };
}

/** The query as a canonical search string. Defaults are simply absent. */
export function serializeRecordsQuery(query: RecordsQuery): string {
  const search = new URLSearchParams();
  for (const key of parameterOrder) {
    switch (key) {
      case 'q':
        if (query.q.trim()) search.set('q', query.q.trim());
        break;
      case 'result':
        for (const value of query.results) search.append('result', value);
        break;
      case 'class':
        for (const value of query.classIds) search.append('class', value);
        break;
      case 'course':
        for (const value of query.courseIds) search.append('course', value);
        break;
      case 'module':
        for (const value of query.moduleIds) search.append('module', value);
        break;
      case 'lecture':
        for (const value of query.lectureIds) search.append('lecture', value);
        break;
      case 'sort':
        if (query.sort) search.set('sort', query.sort);
        break;
      case 'direction':
        if (query.sort) search.set('direction', query.direction);
        break;
      case 'page':
        if (query.page > 1) search.set('page', String(query.page));
        break;
    }
  }
  return search.toString();
}

export function recordsPath(academySlug: string, query: RecordsQuery): string {
  const search = serializeRecordsQuery(query);
  const base = `${routes.academy(academySlug)}/learn/records`;
  return search ? `${base}?${search}` : base;
}

/**
 * Any change to what the server is being asked resets to page 1.
 *
 * Staying on page 7 of a table that now has two pages is how a reader ends up
 * looking at an empty result they cannot explain. Column visibility is
 * deliberately not routed through here: it changes nothing about the query.
 */
export function withRecordsQueryChange(
  current: RecordsQuery,
  change: Partial<Omit<RecordsQuery, 'page'>>,
): RecordsQuery {
  return { ...current, ...change, page: 1 };
}

export function withRecordsPage(
  current: RecordsQuery,
  page: number,
): RecordsQuery {
  return { ...current, page: Math.max(1, Math.floor(page)) };
}

/**
 * Removing a parent facet drops the child selections it made valid.
 *
 * A lecture id from a course nobody is filtering on any more is not a filter
 * the reader can see, and leaving it in place would silently narrow a table
 * that looks unfiltered.
 */
export function pruneOrphanedFacets(
  query: RecordsQuery,
  available: {
    classes: ReadonlyArray<{ value: string }>;
    courses: ReadonlyArray<{ value: string }>;
    modules: ReadonlyArray<{ value: string }>;
    lectures: ReadonlyArray<{ value: string }>;
  },
): RecordsQuery {
  const keep = (ids: string[], options: ReadonlyArray<{ value: string }>) => {
    const allowed = new Set(options.map((option) => option.value));
    return ids.filter((id) => allowed.has(id));
  };
  return {
    ...query,
    classIds: keep(query.classIds, available.classes),
    courseIds: keep(query.courseIds, available.courses),
    moduleIds: keep(query.moduleIds, available.modules),
    lectureIds: keep(query.lectureIds, available.lectures),
  };
}

/**
 * The return location a Review link may carry back.
 *
 * Only this academy's own records path is accepted, and only its supported
 * parameters survive. Anything else falls back to the records root, so a
 * crafted `returnTo` cannot turn Back into an open redirect.
 */
export function safeReturnTo(
  academySlug: string,
  candidate: string | null | undefined,
): string {
  const root = `${routes.academy(academySlug)}/learn/records`;
  if (!candidate) return root;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return root;
  }
  // A protocol-relative or absolute URL is not a path on this site, whatever
  // it looks like after the leading slash.
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return root;

  const [path, search = ''] = decoded.split('?');
  if (path !== root) return root;
  return recordsPath(academySlug, parseRecordsQuery(new URLSearchParams(search)));
}

function parsePage(value: string | null): number {
  if (!value) return 1;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function isId(value: string): boolean {
  return idPattern.test(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.append(key, value);
  }
  return search;
}
