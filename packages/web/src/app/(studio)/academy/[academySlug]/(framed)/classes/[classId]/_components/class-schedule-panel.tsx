'use client';

import { CLASS_SCHEDULE_MAX_SLOTS } from '@cove/shared';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  expandRows,
  groupSlots,
  rowIsValid,
  slotCount,
  toggleDay,
  type ScheduleRow,
} from '../_lib/schedule-rows';
import { ClassPanel, ClassPanelEmpty } from './class-panel';

/**
 * ISO-8601, academy-local: 1 = Monday … 7 = Sunday.
 *
 * Written out as literal keys rather than composed from the number, because
 * the translation types are literal — a composed key would type-check as
 * `string` and stop the compiler from catching a day nobody translated.
 */
const weekdayKeys = {
  1: 'detail.schedule_panel.weekday.1',
  2: 'detail.schedule_panel.weekday.2',
  3: 'detail.schedule_panel.weekday.3',
  4: 'detail.schedule_panel.weekday.4',
  5: 'detail.schedule_panel.weekday.5',
  6: 'detail.schedule_panel.weekday.6',
  7: 'detail.schedule_panel.weekday.7',
} as const;

const shortKeys = {
  1: 'detail.schedule_panel.weekday_short.1',
  2: 'detail.schedule_panel.weekday_short.2',
  3: 'detail.schedule_panel.weekday_short.3',
  4: 'detail.schedule_panel.weekday_short.4',
  5: 'detail.schedule_panel.weekday_short.5',
  6: 'detail.schedule_panel.weekday_short.6',
  7: 'detail.schedule_panel.weekday_short.7',
} as const;

const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

type Weekday = (typeof weekdays)[number];

/** A 학원 class's most common hour, so a new row is one or two clicks. */
const DEFAULT_ROW: ScheduleRow = {
  days: [],
  startMinute: 16 * 60,
  endMinute: 18 * 60,
};

/**
 * When the class meets.
 *
 * Edited in place rather than in a dialog. A timetable is read far more often
 * than it is changed, and the reading is the point: it is the only thing on
 * this page that decides whether a student is paid for turning up, so it has
 * to be legible without opening anything. §8.1 of the student points design.
 *
 * ## A row is some days and one time
 *
 * The API stores one slot per weekday, and the editor used to make a manager
 * say it that way: 월·수·금 17:00–19:00 meant three rows, three weekday
 * dropdowns and six time fields to express one sentence — with the three times
 * free to drift apart on a typo. Days are now chips on a single row, and the
 * row expands to slots on save. The stored shape is unchanged; only what a
 * person has to type is. Genuinely different times per day are different
 * ranges, so they stay separate rows.
 *
 * The chips also replace the dropdown, which mattered more than it looks: a
 * `select` hides six of seven options until it is opened, so choosing Wednesday
 * was a click, a scan and a click. Seven chips are one press, and the whole
 * week is legible without opening anything.
 *
 * The draft is local and the whole set is submitted at once — the API replaces
 * the timetable rather than diffing it, so a half-applied week is not a state
 * this component can produce. Nothing is saved until Save is pressed, and
 * Cancel is simply "go back to what the server says".
 *
 * Edit and Add stay separate. Opening the draft used to append a row, so a
 * manager moving Tuesday an hour later had to add a row, edit the one they
 * came for, and delete the invented one. Changing a time is the common case
 * and adding one is the rare one.
 *
 * Times are typed as clock times and stored as minutes from academy-local
 * midnight. The conversion lives here rather than on the server because the
 * rule is "Tuesdays at four" — a manager types a wall clock, and the wall
 * clock is what the schedule means.
 *
 * A class with no windows is a valid, ordinary class. It simply never pays
 * attendance points, and the empty state says exactly that rather than
 * presenting an unconfigured feature as a problem.
 */
export function ClassSchedulePanel({
  canEdit,
  manager,
}: {
  canEdit: boolean;
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const { detail } = manager;
  const editable = canEdit && detail.status === 'ACTIVE';

  const [draft, setDraft] = React.useState<ScheduleRow[] | null>(null);
  // A save that landed adopts the server's ordering, so the draft closes
  // rather than sitting on top of the rows it just produced.
  const [savedAt, setSavedAt] = React.useState(detail.updatedAt);
  if (draft !== null && manager.scheduleSaved && savedAt !== detail.updatedAt) {
    setSavedAt(detail.updatedAt);
    setDraft(null);
  }

  const rows = draft ?? groupSlots(detail.schedule);

  const invalid = rows.some((row) => !rowIsValid(row));
  // Counted in slots, not rows: the limit is on what gets stored, and one row
  // of five days is five of them.
  const full = slotCount(rows) >= CLASS_SCHEDULE_MAX_SLOTS;

  const edit = (index: number, next: ScheduleRow) =>
    setDraft(rows.map((row, position) => (position === index ? next : row)));

  const openDraft = () => {
    manager.resetSchedule();
    setDraft(rows);
  };

  const openDraftWithNewRow = () => {
    manager.resetSchedule();
    setDraft([...rows, DEFAULT_ROW]);
  };

  return (
    <ClassPanel
      action={
        editable ? (
          draft === null ? (
            // Opening the draft changes nothing. A panel that edited itself
            // the moment it was opened is a panel a manager cannot open to
            // look, and looking is what this one is mostly for.
            rows.length === 0 ? (
              <Button onClick={() => openDraftWithNewRow()} size="sm">
                <Plus />
                {t('detail.schedule_panel.add')}
              </Button>
            ) : (
              <Button onClick={() => openDraft()} size="sm" variant="outline">
                <Pencil />
                {t('detail.schedule_panel.edit')}
              </Button>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                className="h-9 rounded-lg border border-border bg-card px-3.5 text-[14px] font-bold text-ink transition-colors hover:bg-canvas"
                onClick={() => setDraft(null)}
                type="button"
              >
                {t('common:action.cancel')}
              </button>
              <Button
                disabled={invalid || manager.schedulePending}
                onClick={() => manager.saveSchedule(expandRows(rows))}
                size="sm"
              >
                {manager.schedulePending
                  ? t('detail.schedule_panel.saving')
                  : t('detail.schedule_panel.save')}
              </Button>
            </div>
          )
        ) : null
      }
      body={t('detail.schedule_panel.body')}
      count={slotCount(rows)}
      heading={t('detail.schedule_panel.heading')}
    >
      {rows.length === 0 ? (
        <ClassPanelEmpty>
          {editable
            ? t('detail.schedule_panel.empty')
            : t('detail.schedule_panel.empty_readonly')}
        </ClassPanelEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row, index) => (
            <li className="px-5 py-4" key={index}>
              {draft === null ? (
                <ReadOnlyRow row={row} />
              ) : (
                <EditableRow
                  onChange={(next) => edit(index, next)}
                  onRemove={() =>
                    setDraft(rows.filter((_, position) => position !== index))
                  }
                  row={row}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add lives inside the draft, under the rows it appends to, so the new
          row appears where the button is rather than at the far end of a list
          the reader has to go looking down. */}
      {draft !== null && !full ? (
        <div className="px-5 pb-4 pt-3">
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:bg-brand-soft/40 hover:text-brand"
            onClick={() => setDraft([...rows, DEFAULT_ROW])}
            type="button"
          >
            <Plus className="size-4" />
            {t('detail.schedule_panel.add')}
          </button>
        </div>
      ) : null}

      {draft !== null && full ? (
        <p className="px-5 pb-4 text-[13px] font-semibold text-sub">
          {t('detail.schedule_panel.limit', {
            count: CLASS_SCHEDULE_MAX_SLOTS,
          })}
        </p>
      ) : null}

      {manager.scheduleError ? (
        <p className="px-5 pb-4 text-[14px] font-semibold text-danger">
          {errorText(manager.scheduleError, t('detail.schedule_panel.failed'))}
        </p>
      ) : null}
    </ClassPanel>
  );
}

/**
 * The timetable as it reads when nobody is editing it.
 *
 * Teal, for the reason `globals.css` gives that token: a meeting time is
 * measured time, neither a status nor an outcome. The duration is stated
 * because "16:00 – 18:00" is a subtraction a reader should not have to do to
 * answer "how long is this class".
 */
function ReadOnlyRow({ row }: { row: ScheduleRow }) {
  const { t } = useLayoutTranslation('classes');
  const overnight = row.endMinute > 24 * 60;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-soft text-teal">
        <CalendarClock className="size-4" />
      </span>

      <span className="flex flex-wrap gap-1">
        {row.days.map((weekday) => (
          <span
            className="rounded-md bg-accent px-2 py-0.5 text-[12.5px] font-bold text-ink"
            key={weekday}
          >
            {t(shortKeys[weekday as Weekday] ?? shortKeys[1])}
          </span>
        ))}
      </span>

      <span className="font-mono text-[14px] font-semibold tabular-nums">
        {clockOf(row.startMinute)} – {clockOf(row.endMinute)}
      </span>

      <span className="text-[12.5px] font-semibold text-sub">
        <Duration minutes={row.endMinute - row.startMinute} />
        {overnight ? ` · ${t('detail.schedule_panel.next_day')}` : ''}
      </span>
    </div>
  );
}

/** Days as chips, then the one time range they share. */
function EditableRow({
  onChange,
  onRemove,
  row,
}: {
  onChange: (row: ScheduleRow) => void;
  onRemove: () => void;
  row: ScheduleRow;
}) {
  const { t } = useLayoutTranslation('classes');
  const noDays = row.days.length === 0;
  const backwards = row.endMinute <= row.startMinute;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <fieldset className="min-w-0">
          <legend className="sr-only">
            {t('detail.schedule_panel.days_label')}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {weekdays.map((weekday) => {
              const on = row.days.includes(weekday);
              return (
                <button
                  aria-label={t(weekdayKeys[weekday])}
                  aria-pressed={on}
                  className={cn(
                    'h-9 min-w-9 rounded-lg border px-2.5 text-[13px] font-bold transition-colors duration-150 motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    on
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-border bg-card text-sub hover:border-ink/25 hover:text-ink',
                  )}
                  key={weekday}
                  onClick={() => onChange(toggleDay(row, weekday))}
                  type="button"
                >
                  {t(shortKeys[weekday])}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          aria-label={t('detail.schedule_panel.remove')}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-danger/5 hover:text-danger"
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TimeField
          label={t('detail.schedule_panel.start_label')}
          minute={row.startMinute}
          onChange={(startMinute) => onChange({ ...row, startMinute })}
        />
        <span aria-hidden className="text-sub">
          –
        </span>
        <TimeField
          label={t('detail.schedule_panel.end_label')}
          minute={row.endMinute}
          onChange={(endMinute) => onChange({ ...row, endMinute })}
        />
        {!backwards ? (
          <span className="text-[12.5px] font-semibold text-sub">
            <Duration minutes={row.endMinute - row.startMinute} />
          </span>
        ) : null}
      </div>

      {/* Both faults named where they happen, rather than one generic line: a
          row with no day and a row that ends before it starts need different
          corrections. */}
      {noDays ? (
        <p className="text-[13px] font-semibold text-danger">
          {t('detail.schedule_panel.no_days')}
        </p>
      ) : null}
      {backwards ? (
        <p className="text-[13px] font-semibold text-danger">
          {t('detail.schedule_panel.invalid')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One wall-clock time, in and out as minutes from academy-local midnight.
 *
 * `type="time"` gives every locale its own 12- or 24-hour presentation for
 * free, and gives a keyboard user real time semantics rather than two number
 * boxes. A class that runs past midnight is typed as an end time on the next
 * day, which the row labels rather than the control.
 */
function TimeField({
  label,
  minute,
  onChange,
}: {
  label: string;
  minute: number;
  onChange: (minute: number) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <input
        className="h-9 rounded-lg border border-border bg-card px-2.5 font-mono text-[14px] tabular-nums outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        onChange={(event) => {
          const [hours, minutes] = event.target.value.split(':').map(Number);
          if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
          onChange(hours * 60 + minutes);
        }}
        type="time"
        value={clockOf(minute % (24 * 60))}
      />
    </label>
  );
}

/**
 * "2h", "1h 30m", "45m" — the subtraction a reader should not have to do to
 * answer "how long is this class".
 *
 * A component rather than a helper taking `t`: the translation keys are typed
 * as literals, and a function that accepted a loose `t` would give that up for
 * every key it passed through.
 */
function Duration({ minutes }: { minutes: number }) {
  const { t } = useLayoutTranslation('classes');
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return <>{t('detail.schedule_panel.duration_minutes', { minutes: rest })}</>;
  }
  if (rest === 0) {
    return <>{t('detail.schedule_panel.duration_hours', { hours })}</>;
  }
  return (
    <>
      {t('detail.schedule_panel.duration_hours_minutes', {
        hours,
        minutes: rest,
      })}
    </>
  );
}

/** Minutes from local midnight as `HH:MM`, never wrapping past 24:00. */
function clockOf(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
