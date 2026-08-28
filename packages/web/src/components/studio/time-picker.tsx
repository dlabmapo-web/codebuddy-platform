'use client';

import { Clock } from 'lucide-react';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from './overlays';
import { cn } from '@/lib/utils';

/** Every hour, and minutes at the granularity a timetable is actually written in. */
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTE_STEP = 5;
const STEPPED_MINUTES = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, index) => index * MINUTE_STEP,
);

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A wall-clock time, chosen from the values a timetable is written in.
 *
 * Replaces `<input type="time">`, which looked like it belonged to the browser
 * rather than to this page: it carries an unstyleable picker button, renders
 * its own spin controls, and formats itself from the *browser's* locale — so
 * the editor showed `04:00 PM` directly above a read-only row that said
 * `16:00`. One timetable, two clocks. Everything here is 24-hour, which is how
 * the schedule reads everywhere else in the studio and is unambiguous in a
 * timetable besides.
 *
 * Two columns rather than one long list of times. A single 5-minute list is
 * 288 rows to scroll; twenty-four hours beside twelve minutes is two short
 * ones, and it matches how somebody says the time — "four", then "thirty".
 *
 * The lists open scrolled to the current value, so the common edit is nudging
 * an hour rather than hunting for one.
 *
 * What is given up is typing a time directly, and it is worth saying: a
 * schedule is set once per class and read all term, so the cost falls on the
 * rare action. Both columns are ordinary buttons, so a keyboard reaches every
 * value without a custom key handler.
 */
export function TimePicker({
  label,
  minute,
  onChange,
}: {
  /** Names the control for assistive technology — "Starts at". */
  label: string;
  /** Minutes from academy-local midnight. */
  minute: number;
  onChange: (minute: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const hour = Math.floor(minute / 60) % 24;
  const minuteOfHour = minute % 60;

  // A stored time off the step — 16:07 from an earlier edit — still has to be
  // selectable and visible, so it joins the list rather than being rounded
  // away underneath the person looking at it.
  const minutes = STEPPED_MINUTES.includes(minuteOfHour)
    ? STEPPED_MINUTES
    : [...STEPPED_MINUTES, minuteOfHour].sort((a, b) => a - b);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={`${label}: ${pad(hour)}:${pad(minuteOfHour)}`}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-[14px] font-semibold tabular-nums transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          open ? 'border-brand' : 'border-border hover:border-ink/25',
        )}
      >
        <Clock aria-hidden className="size-4 text-sub" />
        {pad(hour)}:{pad(minuteOfHour)}
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <Column
            label={label}
            onSelect={(next) => onChange(next * 60 + minuteOfHour)}
            selected={hour}
            values={HOURS}
          />
          <div aria-hidden className="w-px bg-border" />
          <Column
            label={label}
            onSelect={(next) => onChange(hour * 60 + next)}
            selected={minuteOfHour}
            values={minutes}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One scrolling column of values.
 *
 * `listbox`/`option` rather than a list of toggle buttons: exactly one value
 * is current, and that is what a listbox means. The selected row scrolls
 * itself into the middle when the column mounts — which is when the popover
 * opens — so the current time is under the cursor rather than at the top of a
 * list somebody has to search.
 */
function Column({
  label,
  onSelect,
  selected,
  values,
}: {
  label: string;
  onSelect: (value: number) => void;
  selected: number;
  values: number[];
}) {
  const centre = React.useCallback((node: HTMLButtonElement | null) => {
    node?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <ul
      aria-label={label}
      className="max-h-56 w-16 overflow-y-auto overscroll-contain py-1"
      role="listbox"
    >
      {values.map((value) => {
        const current = value === selected;
        return (
          <li key={value} role="none">
            <button
              aria-selected={current}
              className={cn(
                'block w-full px-3 py-1.5 text-center text-[14px] font-semibold tabular-nums transition-colors',
                'focus-visible:outline-none focus-visible:bg-accent',
                current
                  ? 'bg-brand text-on-brand'
                  : 'text-ink hover:bg-accent',
              )}
              onClick={() => onSelect(value)}
              ref={current ? centre : undefined}
              role="option"
              type="button"
            >
              {pad(value)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
