/**
 * The three periods a ranking can cover, as calendars rather than windows.
 *
 * `7d` and `30d` are right for a report — they answer "how has this student
 * been doing lately" from any day you happen to ask. They are wrong for a
 * competition: a rolling window means yesterday's points silently fall out of
 * the bottom, a position changes overnight for something that happened a month
 * ago, and a season can never end because it never started.
 *
 * `day` is the default. The board is a race and a race wants a start gun:
 * tomorrow morning everyone is level again, so the worst a bad day can cost is
 * a day. §6.3 and §10.2 of the student points design.
 *
 * Refresh and reset are different things. Every period here is recomputed on
 * every request and never cached — the period decides only when the board
 * returns to zero.
 */

import {
  ACADEMY_TIME_ZONE,
  academyDayEnd,
  academyDayStart,
  academyLocalDate,
  addLocalDays,
  type LocalDate,
} from "../content/academy-time.js";

export type PointsPeriodKind = "day" | "week" | "month";

export const pointsPeriodKinds: readonly PointsPeriodKind[] = [
  "day",
  "week",
  "month",
] as const;

export const DEFAULT_POINTS_PERIOD: PointsPeriodKind = "day";

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

  if (kind === "day") {
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
 */
export function previousPointsPeriod(period: PointsPeriod): PointsPeriod {
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
