import {
  DEFAULT_POINTS_PERIOD,
  parsePointsPeriodKind,
  type PointsPeriodKind,
} from '@cove/shared';

/**
 * The two pieces of page state that belong in the address.
 *
 * Both are shareable and both survive a reload. Ledger paging is not here:
 * a scroll position is not a destination, and a cursor in the URL would make
 * Back walk a student through every page they read.
 */
export type PointsQuery = {
  period: PointsPeriodKind;
  classId: string | null;
};

function single(
  value: string | string[] | undefined | null,
): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function parsePointsQuery(
  source: Record<string, string | string[] | undefined> | URLSearchParams,
): PointsQuery {
  const read = (key: string): string | undefined =>
    source instanceof URLSearchParams
      ? (source.get(key) ?? undefined)
      : single(source[key]);

  return {
    period: parsePointsPeriodKind(read('period') ?? DEFAULT_POINTS_PERIOD),
    classId: read('classId') ?? null,
  };
}

export function serializePointsQuery(query: PointsQuery): string {
  const params = new URLSearchParams();
  // The default is what a bare URL already means; printing it would make every
  // shared link carry a parameter that changes nothing.
  if (query.period !== DEFAULT_POINTS_PERIOD) params.set('period', query.period);
  if (query.classId) params.set('classId', query.classId);
  const search = params.toString();
  return search ? `?${search}` : '';
}
