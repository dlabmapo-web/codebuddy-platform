'use client';

import type { ClassScheduleSlotInput } from '@cove/shared';
import { CLASS_SCHEDULE_MAX_SLOTS } from '@cove/shared';
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
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

const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

type Weekday = (typeof weekdays)[number];

function weekdayKey(weekday: number) {
  return weekdayKeys[weekday as Weekday] ?? weekdayKeys[1];
}

/**
 * When the class meets.
 *
 * Edited in place rather than in a dialog. A timetable is read far more often
 * than it is changed, and the reading is the point: it is the only thing on
 * this page that decides whether a student is paid for turning up, so it has
 * to be legible without opening anything. §8.1 of the student points design.
 *
 * The draft is local and the whole set is submitted at once — the API replaces
 * the timetable rather than diffing it, so a half-applied week is not a state
 * this component can produce. Nothing is saved until Save is pressed, and
 * Cancel is simply "go back to what the server says".
 *
 * ## Edit and Add are separate, and that is the whole of this panel's history
 *
 * They were one button. Opening the draft appended a row, so a manager who
 * wanted to move Tuesday an hour later had to press "Add a time", edit the row
 * they came for, and then delete the row the button had invented — three
 * actions and a bin icon to change one number, with a wrong timetable on
 * screen in between. Changing a time is the common case and adding one is the
 * rare one, so Edit opens the draft with exactly the rows the server holds and
 * Add is a row inside it.
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

  const [draft, setDraft] = React.useState<ClassScheduleSlotInput[] | null>(
    null,
  );
  // A save that landed adopts the server's ordering, so the draft closes
  // rather than sitting on top of the rows it just produced.
  const [savedAt, setSavedAt] = React.useState(detail.updatedAt);
  if (draft !== null && manager.scheduleSaved && savedAt !== detail.updatedAt) {
    setSavedAt(detail.updatedAt);
    setDraft(null);
  }

  const rows: ClassScheduleSlotInput[] =
    draft ??
    detail.schedule.map((slot) => ({
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    }));

  const invalid = rows.some((row) => row.endMinute <= row.startMinute);
  const full = rows.length >= CLASS_SCHEDULE_MAX_SLOTS;

  const edit = (index: number, next: Partial<ClassScheduleSlotInput>) => {
    setDraft(
      rows.map((row, position) =>
        position === index ? { ...row, ...next } : row,
      ),
    );
  };

  /** Open the draft on exactly what the server holds. */
  const openDraft = () => {
    manager.resetSchedule();
    setDraft(rows);
  };

  /**
   * Open the draft and append one row.
   *
   * A 16:00–18:00 row rather than an empty one: it is the hour a 학원 class
   * actually starts, so the common case is a weekday choice instead of four
   * fields.
   */
  const openDraftWithNewRow = () => {
    manager.resetSchedule();
    setDraft([...rows, { weekday: 1, startMinute: 16 * 60, endMinute: 18 * 60 }]);
  };

  const addRow = () => {
    setDraft([...rows, { weekday: 1, startMinute: 16 * 60, endMinute: 18 * 60 }]);
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
                onClick={() => manager.saveSchedule(rows)}
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
      count={rows.length}
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
            <li
              className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              key={index}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <Clock className="size-4" />
              </span>

              {draft === null ? (
                <p className="min-w-0 flex-1 text-[14.5px] font-bold text-ink">
                  {t(weekdayKey(row.weekday))}
                  <span className="ml-2 font-mono font-medium tabular-nums text-sub">
                    {clockOf(row.startMinute)} – {clockOf(row.endMinute)}
                    {row.endMinute > 24 * 60
                      ? ` (${t('detail.schedule_panel.next_day')})`
                      : null}
                  </span>
                </p>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <label>
                    <span className="sr-only">
                      {t('detail.schedule_panel.weekday_label')}
                    </span>
                    <select
                      className="h-9 rounded-lg border border-border bg-card px-2 text-[14px] outline-none transition-colors focus:border-brand"
                      onChange={(event) =>
                        edit(index, { weekday: Number(event.target.value) })
                      }
                      value={row.weekday}
                    >
                      {weekdays.map((weekday) => (
                        <option key={weekday} value={weekday}>
                          {t(weekdayKeys[weekday])}
                        </option>
                      ))}
                    </select>
                  </label>

                  <TimeField
                    label={t('detail.schedule_panel.start_label')}
                    minute={row.startMinute}
                    onChange={(startMinute) => edit(index, { startMinute })}
                  />
                  <span aria-hidden className="text-sub">
                    –
                  </span>
                  <TimeField
                    label={t('detail.schedule_panel.end_label')}
                    minute={row.endMinute}
                    onChange={(endMinute) => edit(index, { endMinute })}
                  />

                  {row.endMinute <= row.startMinute ? (
                    <p className="text-[13px] font-semibold text-danger">
                      {t('detail.schedule_panel.invalid')}
                    </p>
                  ) : null}
                </div>
              )}

              {draft !== null ? (
                <button
                  aria-label={t('detail.schedule_panel.remove')}
                  className="grid size-9 place-items-center rounded-lg text-sub transition-colors hover:bg-danger/5 hover:text-danger"
                  onClick={() =>
                    setDraft(rows.filter((_, position) => position !== index))
                  }
                  type="button"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Add lives inside the draft now, under the rows it appends to, so the
          new row appears where the button is rather than at the far end of a
          list the reader has to go looking down. */}
      {draft !== null && !full ? (
        <div className="px-5 pb-4 pt-3">
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand"
            onClick={addRow}
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
          {errorText(
            manager.scheduleError,
            t('detail.schedule_panel.failed'),
          )}
        </p>
      ) : null}
    </ClassPanel>
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
        className="h-9 rounded-lg border border-border bg-card px-2 font-mono text-[14px] tabular-nums outline-none transition-colors focus:border-brand"
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

/** Minutes from local midnight as `HH:MM`, never wrapping past 24:00. */
function clockOf(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}
