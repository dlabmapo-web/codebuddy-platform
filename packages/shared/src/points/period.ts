/**
 * The periods a ranking can cover, as calendars rather than windows.
 *
 * `7d` and `30d` are right for a report — they answer "how has this student
 * been doing lately" from any day you happen to ask. They are wrong for a
 * competition: a rolling window means yesterday's points silently fall out of
 * the bottom, a position changes overnight for something that happened a month
 * ago, and a season can never end because it never started.
 *
 * `all` is the default, and is a calendar period like the rest: a fixed end,
 * an unbounded start, and nothing that ever expires out of the bottom — which
 * is exactly what separates it from the rolling windows above. It answers the
 * question the other three cannot, "how has this class done since it began",
 * and it is the only one that says something on a quiet Monday morning.
 *
 * `day` was the default until then, on the argument that the board is a race
 * and a race wants a start gun. That argument is a good one and the period is
 * still one tap away; what changed is that a start gun every morning also
 * means a board which forgets everything a student has ever done.
 *
 * Refresh and reset are different things. Every period here is recomputed on
 * every request and never cached — the period decides only when the board
 * returns to zero, and `all` is the one that never does.
 */

import {
  ACADEMY_TIME_ZONE,
  academyDayEnd,
  academyDayStart,
  academyLocalDate,
  addLocalDays,
  type LocalDate,
} from "../content/academy-time.js";

export type PointsPeriodKind = "all" | "day" | "week" | "month";

/**
 * Widest first, and the order is load-bearing: every period selector in the
 * product renders its buttons by mapping this array, so this is also the order
 * a reader sees them in and the reason the default sits at the left end.
 */
export const pointsPeriodKinds: readonly PointsPeriodKind[] = [
  "all",
  "day",
  "week",
  "month",
] as const;

export const DEFAULT_POINTS_PERIOD: PointsPeriodKind = "all";

/**
 * The floor an unbounded period starts at.
 *
 * Deliberately not the class's creation date. `resolvePointsPeriod` has no
 * class in scope, and the console resolves one period across many classes at
 * once — a period whose start depends on which class you are looking at is not
 * one period. No award can predate the class that produced it, so this and
 * `Class.createdAt` produce identical sums; the difference is only what a
 * label could print, and no surface prints this one.
 */
export const POINTS_EPOCH_DATE: LocalDate = "1970-01-01";

export type PointsPeriod = {
  kind: PointsPeriodKind;
  timeZone: string;
  /** First academy-local day in the period, inclusive. */
  startDate: LocalDate;
  /** Last academy-local day in the period, inclusive. */
  endDate: LocalDate;
  /** The instant the period opens. */
  startsAt: Date;
  /** The instant the period closes, exclusive. */
  endsAt: Date;
};

/** ISO weekday, 1 = Monday … 7 = Sunday, read off the label itself. */
export function isoWeekday(localDate: LocalDate): number {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** The first day of the academy-local month a date falls in. */
function firstOfMonth(localDate: LocalDate): LocalDate {
  return `${localDate.slice(0, 7)}-01`;
}

/** The last day of the academy-local month a date falls in. */
function lastOfMonth(localDate: LocalDate): LocalDate {
  const [year, month] = localDate.split("-").map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addLocalDays(nextMonth, -1);
}

/**
 * The period containing `now`.
 *
 * Weeks start on Monday because Korea does, and because the class schedule is
 * written in weekdays. Months and days are the academy's, so an evening class
 * is never split across two dates.
 */
export function resolvePointsPeriod(
  kind: PointsPeriodKind,
  now: Date,
  timeZone: string = ACADEMY_TIME_ZONE,
): PointsPeriod {
  const today = academyLocalDate(now, timeZone);

  let startDate: LocalDate;
  let endDate: LocalDate;

  if (kind === "all") {
    // Everything up to and including today. The end still moves with the
    // academy's own clock, so an evening class is not split across two dates.
    startDate = POINTS_EPOCH_DATE;
    endDate = today;
  } else if (kind === "day") {
    startDate = today;
    endDate = today;
  } else if (kind === "week") {
    startDate = addLocalDays(today, -(isoWeekday(today) - 1));
    endDate = addLocalDays(startDate, 6);
  } else {
    startDate = firstOfMonth(today);
    endDate = lastOfMonth(today);
  }

  return {
    kind,
    timeZone,
    startDate,
    endDate,
    startsAt: academyDayStart(startDate, timeZone),
    endsAt: academyDayEnd(endDate, timeZone),
  };
}

/**
 * The period immediately before this one.
 *
 * Used for the rising-position marker, which asks whether a student moved up
 * since the last comparable race. Never rendered as a board of its own.
 *
 * There is nothing before all time, and the honest answer to "what came before
 * everything" is not a period — so this refuses rather than inventing one. The
 * caller is expected to have decided already: `PointsService` skips the marker
 * for `all` exactly as it skips it for `day`, and this throw is the guard that
 * keeps a future caller from silently comparing a board against itself.
 */
export function previousPointsPeriod(period: PointsPeriod): PointsPeriod {
  if (period.kind === "all") {
    throw new Error("All time has no previous period.");
  }
  // One day before this period opened lands inside the previous one for all
  // three kinds: the day before, the Sunday that closed last week, and the
  // last day of last month.
  const dayBefore = addLocalDays(period.startDate, -1);
  return resolvePointsPeriod(
    period.kind,
    academyDayStart(dayBefore, period.timeZone),
    period.timeZone,
  );
}

/** Parses an untrusted period from a URL or an input schema. */
export function parsePointsPeriodKind(value: unknown): PointsPeriodKind {
  return pointsPeriodKinds.includes(value as PointsPeriodKind)
    ? (value as PointsPeriodKind)
    : DEFAULT_POINTS_PERIOD;
}
