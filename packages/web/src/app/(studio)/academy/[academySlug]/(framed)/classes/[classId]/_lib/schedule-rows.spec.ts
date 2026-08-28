import { describe, expect, it } from 'vitest';

import {
  expandRows,
  groupSlots,
  rowIsValid,
  slotCount,
  toggleDay,
  type ScheduleRow,
} from './schedule-rows';

const slot = (weekday: number, startMinute = 1020, endMinute = 1140) => ({
  weekday,
  startMinute,
  endMinute,
});

describe('groupSlots', () => {
  it('collapses one time across several days into a single row', () => {
    // The case the editor exists for: 월·수·금 17:00 was three dropdowns and
    // six time fields, and is now one row.
    expect(groupSlots([slot(1), slot(3), slot(5)])).toEqual([
      { days: [1, 3, 5], startMinute: 1020, endMinute: 1140 },
    ]);
  });

  it('keeps genuinely different times as separate rows', () => {
    const rows = groupSlots([slot(1, 600, 720), slot(2, 1020, 1140)]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.days).toEqual([1]);
    expect(rows[1]?.days).toEqual([2]);
  });

  it('orders rows by the week, then by start time', () => {
    const rows = groupSlots([slot(5), slot(1, 600, 720), slot(1)]);

    expect(rows.map((row) => row.days)).toEqual([[1], [1, 5]]);
    expect(rows[0]?.startMinute).toBe(600);
  });

  it('sorts the days inside a row', () => {
    expect(groupSlots([slot(5), slot(1), slot(3)])[0]?.days).toEqual([1, 3, 5]);
  });

  it('drops a duplicated weekday rather than doubling it', () => {
    // Two identical stored slots would otherwise render as one chip and expand
    // back to two, growing the timetable on every save.
    expect(groupSlots([slot(2), slot(2)])[0]?.days).toEqual([2]);
  });

  it('answers with nothing for an empty timetable', () => {
    expect(groupSlots([])).toEqual([]);
  });
});

describe('expandRows', () => {
  it('round-trips a grouped timetable back to the stored shape', () => {
    const slots = [slot(1), slot(3), slot(5)];

    expect(expandRows(groupSlots(slots))).toEqual(slots);
  });

  it('orders the result by the week', () => {
    const rows: ScheduleRow[] = [
      { days: [5, 1], startMinute: 1020, endMinute: 1140 },
    ];

    expect(expandRows(rows).map((s) => s.weekday)).toEqual([1, 5]);
  });

  it('ignores a row with no day selected', () => {
    // Emptying a row on the way to refilling it must not block saving the rest
    // of the timetable.
    const rows: ScheduleRow[] = [
      { days: [], startMinute: 600, endMinute: 720 },
      { days: [2], startMinute: 1020, endMinute: 1140 },
    ];

    expect(expandRows(rows)).toEqual([slot(2)]);
  });
});

describe('slotCount', () => {
  it('counts stored slots, not rows, so the limit means what it says', () => {
    expect(
      slotCount([
        { days: [1, 3, 5], startMinute: 600, endMinute: 720 },
        { days: [2], startMinute: 1020, endMinute: 1140 },
      ]),
    ).toBe(4);
  });
});

describe('rowIsValid', () => {
  it('requires a day', () => {
    expect(rowIsValid({ days: [], startMinute: 600, endMinute: 720 })).toBe(
      false,
    );
  });

  it('requires the end to be after the start', () => {
    expect(rowIsValid({ days: [1], startMinute: 720, endMinute: 720 })).toBe(
      false,
    );
    expect(rowIsValid({ days: [1], startMinute: 600, endMinute: 720 })).toBe(
      true,
    );
  });
});

describe('toggleDay', () => {
  it('adds a day in weekday order', () => {
    const row: ScheduleRow = { days: [1, 5], startMinute: 600, endMinute: 720 };

    expect(toggleDay(row, 3).days).toEqual([1, 3, 5]);
  });

  it('removes a day that was already chosen', () => {
    const row: ScheduleRow = { days: [1, 3], startMinute: 600, endMinute: 720 };

    expect(toggleDay(row, 3).days).toEqual([1]);
  });
});
