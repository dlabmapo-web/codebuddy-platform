import {
  solveDurationParts,
  type TeacherAttentionKind,
  type TeacherAttentionReason,
  type TeacherProgressStatus,
} from '@cove/shared';

/**
 * How Solution status reads, decided away from the markup.
 *
 * The rules worth checking without a browser are here: an unmeasured duration
 * never reads as zero, a status never depends on colour alone, and an
 * attention reason always resolves to a sentence with its own number in it.
 */

/**
 * Tone per status. Every badge carries its own words, so colour reinforces a
 * state rather than carrying it.
 */
export const statusTones: Record<TeacherProgressStatus, string> = {
  not_started: 'bg-accent text-sub',
  in_progress: 'bg-brand-soft text-brand',
  solved: 'bg-success/10 text-success',
};

/**
 * Attention is warm, never red.
 *
 * A student who is stuck has not failed at anything, and the danger tone is
 * reserved for things that went wrong with the platform.
 */
export const attentionTone =
  'bg-warning/10 text-warning ring-1 ring-inset ring-warning/25';

export type DurationDisplay =
  | { kind: 'missing' }
  | { kind: 'hours'; hours: number; minutes: number }
  | { kind: 'minutes'; minutes: number; seconds: number }
  | { kind: 'seconds'; seconds: number };

/**
 * The shape a duration is printed in, or its absence.
 *
 * Returns a choice rather than a string so the locale supplies the words:
 * "1h 02m" and "1시간 2분" are the same fact.
 */
export function durationDisplay(seconds: number | null): DurationDisplay {
  const parts = solveDurationParts(seconds);
  if (!parts) return { kind: 'missing' };
  if (parts.hours > 0) {
    return { kind: 'hours', hours: parts.hours, minutes: parts.minutes };
  }
  if (parts.minutes > 0) {
    return { kind: 'minutes', minutes: parts.minutes, seconds: parts.seconds };
  }
  return { kind: 'seconds', seconds: parts.seconds };
}

/**
 * The translation key and interpolation one reason needs.
 *
 * `long_solve` carries a duration rather than a raw second count, because
 * "1,800" is not something a teacher can act on and "30m" is.
 */
export function attentionMessage(reason: TeacherAttentionReason): {
  key: `progress.attention.${TeacherAttentionKind}`;
  count: number;
  duration: DurationDisplay;
} {
  return {
    key: `progress.attention.${reason.kind}`,
    count: reason.value,
    duration:
      reason.kind === 'long_solve'
        ? durationDisplay(reason.value)
        : { kind: 'missing' },
  };
}

/** The distinct kinds behind a set of reasons, in a stable printed order. */
export function attentionKindsOf(
  reasons: TeacherAttentionReason[],
): TeacherAttentionKind[] {
  const order: TeacherAttentionKind[] = [
    'repeated_failures',
    'stalled',
    'long_solve',
  ];
  const present = new Set(reasons.map((reason) => reason.kind));
  return order.filter((kind) => present.has(kind));
}

/**
 * A percentage as a bar width, clamped.
 *
 * Clamping in the view model rather than in CSS keeps a nonsense value from a
 * future contract change out of the layout entirely.
 */
export function meterWidth(percent: number): string {
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

/**
 * Whether the page is showing a filtered view of a class that has data.
 *
 * The distinction decides which empty state is honest: "no matches, reset the
 * filters" and "this class has no students" are different facts and the second
 * must never be shown for the first.
 */
export function isFiltered(query: {
  q: string;
  courseIds: string[];
  statuses: string[];
  attention: string[];
}): boolean {
  return (
    query.q.trim() !== '' ||
    query.courseIds.length > 0 ||
    query.statuses.length > 0 ||
    query.attention.length > 0
  );
}

/** `1-2-3 · Course` as the problem cell prints its coordinate. */
export function outlineLabel(
  outlineNumber: string | null,
  title: string,
): string {
  return outlineNumber ? `${outlineNumber} ${title}` : title;
}
