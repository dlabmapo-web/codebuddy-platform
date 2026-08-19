import { overviewRanges, type OverviewRange } from '@cove/shared';

/**
 * The student overview's URL state, and the one default that stays out of it.
 *
 * §6.2 — the page carries a period and, for a student in more than one class,
 * which class a standing describes. There is deliberately no course or
 * curriculum filter: a student's whole scope is small enough to read at once,
 * and a filter bar in front of a page whose job is "open my work" is furniture
 * in front of the door.
 */

export type StudentOverviewQuery = {
  range: OverviewRange;
  standingClassId: string | null;
};

/**
 * Thirty days, and the one place this page departs from the teacher's seven.
 *
 * A student attends one or two lessons a week. A seven-day window shows an
 * empty page to a child who is doing fine, and the first thing this page says
 * should never be that.
 */
export const DEFAULT_STUDENT_RANGE: OverviewRange = '30d';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anything unsupported falls back rather than failing. */
export function parseStudentOverviewQuery(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): StudentOverviewQuery {
  const read = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };

  const range = overviewRanges.find((entry) => entry === read('range'));
  const standingClassId = read('class');

  return {
    range: range ?? DEFAULT_STUDENT_RANGE,
    standingClassId:
      standingClassId && UUID.test(standingClassId) ? standingClassId : null,
  };
}

/** The default period never appears in the address, so a shared link is bare. */
export function studentOverviewPath(
  academyId: string,
  query: StudentOverviewQuery,
): string {
  const search = new URLSearchParams();
  if (query.range !== DEFAULT_STUDENT_RANGE) search.set('range', query.range);
  if (query.standingClassId) search.set('class', query.standingClassId);
  const suffix = search.toString();
  return `/studio/academies/${academyId}${suffix ? `?${suffix}` : ''}`;
}

/** The exact state a server render was made for, for cache identity. */
export function serializeStudentOverviewQuery(
  query: StudentOverviewQuery,
): string {
  return `${query.range}|${query.standingClassId ?? 'auto'}`;
}
