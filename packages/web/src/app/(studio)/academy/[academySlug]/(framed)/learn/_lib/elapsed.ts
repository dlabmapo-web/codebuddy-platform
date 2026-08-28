/**
 * How long ago a draft was touched, as arguments for `Intl.RelativeTimeFormat`.
 *
 * The formatter is what does the wording, so this stays a pure pair of number
 * and unit. That is deliberate: "3 minutes ago" and "3분 전" are the same fact
 * in two languages, and a hand-written string per locale is how the two drift.
 * It also means no new translation keys for something the platform already
 * knows how to say.
 *
 * Negative for the past, which is the convention the formatter expects.
 *
 * Units stop at the week. A draft older than that is not something a student
 * is about to continue, and "2 months ago" measures a decision they have
 * already made rather than one they are making now.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type Elapsed = [value: number, unit: Intl.RelativeTimeFormatUnit];

export function elapsedSince(iso: string, now: number): Elapsed | null {
  const then = new Date(iso).getTime();
  // A malformed timestamp is not worth a broken row. The draft still lists,
  // opens, and discards; it just does not say when it was written.
  if (Number.isNaN(then)) return null;

  const delta = then - now;
  const size = Math.abs(delta);

  // Rounded toward zero, so 59 seconds reads as "now" rather than "1 minute
  // ago" — the draft was saved while the page was open.
  if (size < MINUTE) return [0, 'minute'];
  if (size < HOUR) return [Math.trunc(delta / MINUTE), 'minute'];
  if (size < DAY) return [Math.trunc(delta / HOUR), 'hour'];
  if (size < WEEK) return [Math.trunc(delta / DAY), 'day'];
  return [Math.trunc(delta / WEEK), 'week'];
}

/** Newest first — the draft a student came back for is the one on top. */
export function byMostRecent(a: { updatedAt: string }, b: { updatedAt: string }) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
