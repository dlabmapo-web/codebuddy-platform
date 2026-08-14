/**
 * Calendar days, as an academy counts them.
 *
 * "This week" is a claim about a classroom, not about UTC. A lesson that ran
 * from 19:00 to 21:00 Seoul time on a Monday belongs to that Monday, and a
 * period boundary drawn at UTC midnight would move a third of every evening
 * class into the previous day — silently, and only for evening classes.
 *
 * Everything here is pure and takes the instant it should reason about, so one
 * response cannot disagree with itself while it is being assembled, and a
 * daylight-saving edge can be tested without waiting for October.
 *
 * See §5.2 and §13.1 of the teacher academy overview design.
 */

/**
 * The one academy timezone the platform currently serves.
 *
 * A constant rather than a column because there is nothing yet to read: every
 * academy is Korean, and a per-academy zone that nobody can set would be a
 * second source of truth for the same answer. When academies span zones, this
 * becomes `academy.timeZone` and every function here already takes the zone as
 * an argument, so the change is a lookup rather than a rewrite.
 */
export const ACADEMY_TIME_ZONE = "Asia/Seoul";

/** `YYYY-MM-DD` in the academy's zone. The key a daily projection stores. */
export type LocalDate = string;

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): value is LocalDate {
  return localDatePattern.test(value);
}

/**
 * The zone's offset from UTC at one instant, in milliseconds.
 *
 * Read from `Intl` rather than from a table: the runtime already ships the
 * rules, and a hand-maintained offset is wrong the first time a government
 * changes its mind.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  // Whole seconds: `formatToParts` cannot report milliseconds, so comparing
  // against them would report a fixed sub-second error as a zone offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Which academy-local day an instant falls on. */
export function academyLocalDate(
  instant: Date | string,
  timeZone: string = ACADEMY_TIME_ZONE,
): LocalDate {
  const date = new Date(instant);
  const shifted = new Date(date.getTime() + zoneOffsetMs(date, timeZone));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The instant an academy-local day begins.
 *
 * Guess, measure, correct: the offset depends on the instant, and the instant
 * is what is being solved for. One correction is enough for every real zone —
 * transitions move the wall clock by an hour, never by a day.
 */
export function academyDayStart(
  localDate: LocalDate,
  timeZone: string = ACADEMY_TIME_ZONE,
): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstGuess = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
  const corrected = naive - zoneOffsetMs(firstGuess, timeZone);
  return new Date(corrected);
}

/** The exclusive end of an academy-local day. */
export function academyDayEnd(
  localDate: LocalDate,
  timeZone: string = ACADEMY_TIME_ZONE,
): Date {
  return academyDayStart(addLocalDays(localDate, 1), timeZone);
}

/** Calendar arithmetic on the label itself, which no zone can perturb. */
export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Whole calendar days from one local date to another, `to` exclusive. */
export function localDaysBetween(from: LocalDate, to: LocalDate): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/**
 * Every local date in a closed range, oldest first.
 *
 * A momentum chart has to draw the days nobody worked; deriving its x-axis
 * from the rows that exist would silently close the gaps and turn a quiet week
 * into a busy one.
 */
export function localDateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const span = localDaysBetween(from, to);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, index) =>
    addLocalDays(from, index),
  );
}

/** `YYYY-MM`, for the monthly buckets an all-time range falls back to. */
export function localMonth(localDate: LocalDate): string {
  return localDate.slice(0, 7);
}
