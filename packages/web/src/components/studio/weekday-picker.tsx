'use client';

import { cn } from '@/lib/utils';

/**
 * Which days of the week, as one control rather than seven.
 *
 * Seven separate buttons with gaps between them read as seven decisions. A
 * week is one decision with seven parts, so the cells are joined into a single
 * bordered strip with hairline dividers — the shape says "pick from this set",
 * which is what a segmented control is for and what a row of loose chips is
 * not.
 *
 * It replaced a `<select>`, and that is the larger win: a dropdown hid six of
 * the seven options until it was opened, so choosing Wednesday was a click, a
 * scan and a click, and the days already chosen were invisible until you
 * opened it again. Here the whole week and the whole answer are on screen at
 * once.
 *
 * `aria-pressed` rather than checkbox semantics: these are toggle buttons, and
 * a screen reader announces each as pressed or not without the group claiming
 * to be a form field.
 */
export function WeekdayPicker({
  className,
  days,
  label,
  onToggle,
  options,
}: {
  className?: string;
  /** ISO-8601 weekdays currently chosen: 1 = Monday … 7 = Sunday. */
  days: number[];
  /** Names the group for assistive technology. */
  label: string;
  onToggle: (weekday: number) => void;
  /** The seven days in reading order, each with a short and a full name. */
  options: { weekday: number; short: string; full: string }[];
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        'inline-flex overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
      role="group"
    >
      {options.map((option, index) => {
        const on = days.includes(option.weekday);
        return (
          <button
            aria-label={option.full}
            aria-pressed={on}
            className={cn(
              'h-9 min-w-11 px-1 text-[13px] font-bold transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50',
              index > 0 && 'border-l border-border',
              on
                ? 'bg-brand text-on-brand'
                : 'text-sub hover:bg-accent hover:text-ink',
            )}
            key={option.weekday}
            onClick={() => onToggle(option.weekday)}
            type="button"
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
}
