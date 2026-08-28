import type { ClassScheduleSlotInput } from '@cove/shared';

/**
 * A timetable as a manager thinks of it: some days, one time.
 *
 * The API stores one slot per weekday, which is the right shape for asking
 * "is this student inside a class window right now". It is the wrong shape for
 * editing. A 학원 class that meets 월·수·금 17:00–19:00 is three slots, and the
 * editor made you say so three times — three weekday dropdowns and six time
 * fields to express one sentence, with the times free to drift apart by a
 * typo on any of them.
 *
 * So the editor groups: identical time ranges collapse into one row with
 * several days selected, and the row expands back to slots on save. The stored
 * shape never changes; only what a person has to type does.
 *
 * A schedule with genuinely different times per day still works — those are
 * different ranges, so they stay different rows.
 */
export type ScheduleRow = {
  /** ISO-8601 weekdays: 1 = Monday … 7 = Sunday. */
  days: number[];
  startMinute: number;
  endMinute: number;
};

const rangeKey = (start: number, end: number) => `${start}-${end}`;

/** Slots as rows, one per distinct time range, days ascending. */
export function groupSlots(slots: ClassScheduleSlotInput[]): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow>();

  for (const slot of slots) {
    const key = rangeKey(slot.startMinute, slot.endMinute);
    const row = rows.get(key);
    if (row) {
      // A duplicated weekday would render as one chip and expand back to two
      // identical slots, quietly doubling the row on every save.
      if (!row.days.includes(slot.weekday)) row.days.push(slot.weekday);
      continue;
    }
    rows.set(key, {
      days: [slot.weekday],
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    });
  }

  return [...rows.values()]
    .map((row) => ({ ...row, days: [...row.days].sort((a, b) => a - b) }))
    .sort(
      (a, b) =>
        (a.days[0] ?? 0) - (b.days[0] ?? 0) || a.startMinute - b.startMinute,
    );
}

/**
 * Rows back to slots, in the order the week runs.
 *
 * A row with no days selected contributes nothing rather than failing: it is a
 * row a manager has emptied on the way to filling it in again, and refusing to
 * save the rest of the timetable over it would be punishing a keystroke.
 */
export function expandRows(rows: ScheduleRow[]): ClassScheduleSlotInput[] {
  return rows
    .flatMap((row) =>
      row.days.map((weekday) => ({
        weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      })),
    )
    .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

/** How many slots these rows will actually store, for the limit. */
export function slotCount(rows: ScheduleRow[]): number {
  return rows.reduce((total, row) => total + row.days.length, 0);
}

/** A row is only saveable once it names a day and ends after it starts. */
export function rowIsValid(row: ScheduleRow): boolean {
  return row.days.length > 0 && row.endMinute > row.startMinute;
}

/** Add or remove one day, keeping the week in order. */
export function toggleDay(row: ScheduleRow, weekday: number): ScheduleRow {
  const days = row.days.includes(weekday)
    ? row.days.filter((day) => day !== weekday)
    : [...row.days, weekday].sort((a, b) => a - b);
  return { ...row, days };
}
