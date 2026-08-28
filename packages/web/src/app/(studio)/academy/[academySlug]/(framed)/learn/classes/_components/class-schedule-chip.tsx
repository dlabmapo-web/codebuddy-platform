import { CalendarClock } from 'lucide-react';

/**
 * When a class meets.
 *
 * Teal, and specifically not brand blue or a status colour, because
 * `globals.css` already reserves that hue for measured time: "duration is the
 * one measurement on the teaching surfaces that is neither a status nor an
 * outcome". A meeting time is exactly that — 토 10:00 is not good news or bad
 * news, it is when to be there — so the token that exists for it is the one it
 * takes.
 *
 * The glyph is not decoration. Lifted out of the description, `토 10:00` is a
 * short string with no context; the clock is what says the chip is a time
 * rather than a room number or a level.
 */
export function ClassScheduleChip({ schedule }: { schedule: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-soft px-2.5 py-1 text-[12.5px] font-bold text-teal">
      <CalendarClock aria-hidden className="size-3.5" strokeWidth={2.25} />
      {schedule}
    </span>
  );
}
