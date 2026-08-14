import type {
  OverviewAttentionKind,
  OverviewAttentionReason,
} from '@cove/shared';
import {
  BatteryLow,
  CirclePause,
  CircleX,
  CloudOff,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';

/**
 * How teacher analytics data becomes something on a screen.
 *
 * Presentation only, and deliberately: the thresholds, the ordering, and the
 * score definition are all decided in `@cove/shared`, where they can be tested
 * without a browser. What lives here is the part that is genuinely about
 * reading — which tone, how a duration is spelled, how a name fits an axis —
 * and it is kept out of the components so a chart and its accessible table
 * cannot describe the same student differently.
 */

/**
 * The tone an attention chip carries.
 *
 * Five reasons, five hues, each one motivated rather than picked for variety.
 *
 * Red is a condition worth inspecting *now* — the student is actively stuck.
 * Amber is work that has stopped. Blue is neutral information about one
 * attempt. Slate is dormancy, which is deliberately the calmest of the five: a
 * child who has not opened the app may be ill, and a red badge would say
 * something about them that nobody has measured. Teal is the page's colour for
 * measured time, and thin participation is a time measurement.
 *
 * None of them is green. "Not flagged" is the absence of a chip rather than a
 * chip saying so, because a green badge beside a name is a verdict on a child
 * and §4 rules those out in both directions.
 */
export const attentionTones: Record<OverviewAttentionKind, string> = {
  repeated_failures: 'bg-danger/10 text-danger',
  stalled: 'bg-warning/10 text-warning',
  long_solve: 'bg-brand/10 text-brand',
  inactive: 'bg-retired/10 text-retired',
  low_participation: 'bg-teal/10 text-teal',
};

/**
 * One icon per reason, so the five are told apart before they are read.
 *
 * Each one draws what the measurement literally is — a repeated cross for
 * repeated failure, a pause for stalled work, an hourglass for a long attempt,
 * a cloud with no connection for no activity, a low battery for thin
 * participation. §12 requires colour to be accompanied by shape or text, and
 * this is the shape half; the number beside it is the text half.
 *
 * Shared with the table rather than declared twice: the Teaching queue names
 * five students and Student analytics names all of them, and the same reason
 * has to look the same in both or a teacher will read them as different things.
 */
export const attentionIcons: Record<OverviewAttentionKind, LucideIcon> = {
  repeated_failures: CircleX,
  stalled: CirclePause,
  long_solve: Hourglass,
  inactive: CloudOff,
  low_participation: BatteryLow,
};

/**
 * The number interpolated into an attention reason's translated sentence.
 * `long_solve` is stored in seconds but spoken to teachers in minutes.
 */
export function attentionReasonDisplayValue(
  reason: OverviewAttentionReason,
): number {
  if (reason.kind !== 'long_solve') return reason.value;
  return Math.max(1, Math.round(reason.value / 60));
}

/**
 * A duration a person would say out loud.
 *
 * Returns parts rather than a string so the caller translates. "4h 42m" and
 * "4시간 42분" are the same reading and must not be two implementations.
 */
export type DurationDisplay =
  | { kind: 'none' }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'hours'; hours: number; minutes: number };

export function durationDisplay(seconds: number | null): DurationDisplay {
  if (seconds === null || seconds <= 0) return { kind: 'none' };
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    // Under a minute still reads as a minute: "0m active" would tell a teacher
    // the student did nothing, which is the one thing it does not mean.
    return { kind: 'minutes', minutes: Math.max(1, totalMinutes) };
  }
  return {
    kind: 'hours',
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/** A meter width that never renders a sliver as nothing. */
export function meterWidth(percent: number | null): string {
  if (percent === null) return '0%';
  return `${Math.max(0, Math.min(100, percent))}%`;
}

/**
 * A name short enough for an axis, with the full one still available.
 *
 * Korean names are short and Latin ones are not, so the cut is by grapheme
 * count rather than by pixel guesswork, and the caller always renders the full
 * name in the tooltip and the accessible table.
 */
export function shortName(name: string, max = 8): string {
  const characters = [...name];
  return characters.length <= max
    ? name
    : `${characters.slice(0, max - 1).join('')}…`;
}

/**
 * How wide the participation plot has to be to stay readable.
 *
 * §6.5 forbids silently showing only the most active students, so the plot
 * grows and scrolls sideways rather than dropping bars. The per-student width
 * is what keeps two bars and a name legible; the floor keeps a class of three
 * from rendering as three enormous columns.
 */
export function participationWidth(students: number): number {
  return Math.max(560, students * 56);
}

/**
 * A local date, in the reader's own locale rather than in ISO.
 *
 * Parsed as UTC deliberately. The value is already an academy-local calendar
 * date — `2026-08-08` is the eighth in Seoul, whatever the reader's device
 * thinks — so letting the browser apply its own offset would print the seventh
 * to a teacher marking work in London.
 */
export function formatLocalDate(
  localDate: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
