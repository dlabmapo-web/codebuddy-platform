'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ActiveLearnerRate, ClassComparisonRow } from '@cove/shared';
import { HIGHLIGHT_MIN_ACTIVE_STUDENTS } from '@cove/shared';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Activity, LayoutGrid, Trophy } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay, meterWidth } from '../../_lib/overview-view';
import { EmptyState, Panel } from '../overview-ui/panel';

/**
 * How the academy is learning, and which class is doing it best right now.
 *
 * Two objects, deliberately in this order. The rate comes first because it is
 * the academy's single answer and it publishes both sides of its own fraction —
 * §9.5's whole point is that a manager can check it. The class table comes
 * second because it is what the rate is made of.
 *
 * The highlight is the section's most dangerous element and is written to be
 * hard to misread. It names the metric and the period on the same line as the
 * class, it states the eligibility floor, and it says in as many words that it
 * is not a claim about the best class. A two-student class where both logged in
 * is 100%; letting that outrank a twenty-student class at 85% would teach
 * managers to distrust the panel within a week, which is why the floor is in
 * `@cove/shared` and stated here rather than being a silent filter.
 *
 * Every measurement that was not taken renders as an em dash with a spoken
 * label, never as zero. A class whose students have not submitted anything has
 * no median solve time, and `0m` would describe a class that works instantly.
 */
export function LearningHealth({
  academyId,
  classes,
  highlightClassId,
  isStale,
  rate,
  truncated,
}: {
  academyId: string;
  classes: ClassComparisonRow[];
  highlightClassId: string | null;
  isStale: boolean;
  rate: ActiveLearnerRate;
  truncated: boolean;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('manager');
  const highlight = classes.find((row) => row.classId === highlightClassId);

  return (
    <Panel
      description={t('learning.description')}
      icon={Activity}
      id="manager-learning"
      meta={t('learning.meta', { count: classes.length })}
      testId="manager-learning"
      title={t('learning.title')}
      tone="peer"
    >
      <div className="grid gap-px bg-border lg:grid-cols-[1fr_1.2fr]">
        <ActiveLearnerRateCard rate={rate} />

        {/* The highlight, or the honest reason there is not one. An empty slot
            here would read as a page that failed to compute something. */}
        <div className="bg-card p-4">
          {highlight ? (
            <>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-teal">
                <Trophy aria-hidden className="size-3.5" strokeWidth={2.5} />
                {t('learning.highlight_title')}
              </p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-[19px] font-extrabold tracking-[-0.02em]">
                  {highlight.className}
                </span>
                <span className="font-mono text-[19px] font-extrabold tabular-nums text-teal">
                  {t('percent', { value: highlight.activeLearnerRate ?? 0 })}
                </span>
              </p>
              <p className="mt-1.5 text-[12px] leading-[1.55] text-sub">
                {t('learning.highlight_body', {
                  minimum: HIGHLIGHT_MIN_ACTIVE_STUDENTS,
                  name: highlight.className,
                  rate: highlight.activeLearnerRate ?? 0,
                })}
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-sub">
                <Trophy aria-hidden className="size-3.5" strokeWidth={2.5} />
                {t('learning.highlight_title')}
              </p>
              <p className="mt-2 text-[13px] leading-[1.6] text-sub">
                {t('learning.no_highlight')}
              </p>
            </>
          )}
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="inline-flex h-9 items-center rounded-lg bg-peer px-3.5 text-[13px] font-bold text-on-peer transition-opacity hover:opacity-90"
              href={`${routes.academy(academySlug)}/classes`}
            >
              {t('learning.create_class')}
            </Link>
          }
          body={t('learning.empty_body')}
          icon={LayoutGrid}
          title={t('learning.empty_title')}
          tone="peer"
        />
      ) : (
        <ClassComparisonTable
          academyId={academyId}
          highlightClassId={highlightClassId}
          isStale={isStale}
          rows={classes}
          truncated={truncated}
        />
      )}
    </Panel>
  );
}

/**
 * §9.5's rate, with its numerator and denominator on screen beside it.
 *
 * The fraction is not a caption. It is the reason the number is trustworthy,
 * and putting it in small grey type under a big percentage is how it gets
 * ignored — so it is set at reading size directly under the figure, and the
 * meter is drawn from the same two numbers.
 */
function ActiveLearnerRateCard({ rate }: { rate: ActiveLearnerRate }) {
  const { t } = useTranslation('manager');

  if (rate.state === 'no_students') {
    return (
      <div className="bg-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-sub">
          {t('rate.title')}
        </p>
        <p className="mt-2 text-[17px] font-extrabold">
          {t('rate.no_students_title')}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-[1.6] text-sub">
          {t('rate.no_students_body')}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-brand">
        {t('rate.title')}
      </p>
      <p className="mt-1.5 font-mono text-[40px] font-extrabold leading-none tabular-nums text-brand">
        {t('percent', { value: rate.percent ?? 0 })}
      </p>
      <p className="mt-2 text-[13px] font-semibold">
        {t('rate.fraction', {
          active: rate.activeStudents,
          enrolled: rate.enrolledStudents,
        })}
      </p>
      <span
        aria-hidden
        className="mt-2.5 block h-2 w-full overflow-hidden rounded-full bg-accent"
      >
        <span
          className="block h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: meterWidth(rate.percent) }}
        />
      </span>
      <p className="mt-2.5 text-[11.5px] leading-[1.55] text-sub">
        {t('rate.explain')}
      </p>
    </div>
  );
}

const column = createColumnHelper<ClassComparisonRow>();

/**
 * The class comparison, as a TanStack table.
 *
 * §10 and §16 — every interactive data table in the manager surfaces uses
 * TanStack Table. This one sorts client-side, and that is not an exception to
 * the server-state rule: the class list is bounded at 100 rows by the contract,
 * so it is already entirely in hand and a round trip to reorder it would be a
 * round trip that answers nothing new. The people directory next door, which is
 * unbounded, sorts on the server.
 *
 * Sorting is announced rather than only drawn. `aria-sort` on the header cell
 * and a per-column label are what let a screen reader tell an ordered column
 * from an unordered one; the arrow is the sighted half of the same statement.
 */
function ClassComparisonTable({
  academyId,
  highlightClassId,
  isStale,
  rows,
  truncated,
}: {
  academyId: string;
  highlightClassId: string | null;
  isStale: boolean;
  rows: ClassComparisonRow[];
  truncated: boolean;
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('manager');
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'activeLearnerRate', desc: true },
  ]);

  const columns = React.useMemo(
    () => [
      column.accessor('className', {
        header: () => t('learning.column.class'),
        cell: (info) => (
          <span className="flex min-w-0 items-center gap-2">
            <Link
              className="truncate font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={`${routes.academy(academySlug)}/classes`}
            >
              {info.getValue()}
            </Link>
            {info.row.original.classId === highlightClassId ? (
              <Trophy
                aria-label={t('learning.highlight_title')}
                className="size-3.5 shrink-0 text-teal"
                strokeWidth={2.5}
              />
            ) : null}
          </span>
        ),
      }),
      column.accessor('teacherName', {
        header: () => t('learning.column.teacher'),
        cell: (info) =>
          info.getValue() ?? (
            // Not an em dash: an unassigned class is a state with a name and a
            // consequence, and the action queue above is already asking about
            // it. A blank cell would hide the link between the two.
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              {t('learning.unassigned')}
            </span>
          ),
      }),
      column.accessor('enrolledStudents', {
        header: () => t('learning.column.enrolled'),
        cell: (info) => <Figure value={info.getValue()} />,
        meta: { align: 'right' },
      }),
      column.accessor('activeStudents', {
        header: () => t('learning.column.active'),
        cell: (info) => <Figure value={info.getValue()} />,
        meta: { align: 'right' },
      }),
      column.accessor('activeLearnerRate', {
        header: () => t('learning.column.rate'),
        cell: (info) => <RateCell percent={info.getValue()} />,
        sortUndefined: 'last',
      }),
      column.accessor('medianActiveSeconds', {
        header: () => t('learning.column.median_time'),
        cell: (info) => <DurationCell seconds={info.getValue()} />,
        meta: { align: 'right' },
        sortUndefined: 'last',
      }),
      column.accessor('exerciseCompletion', {
        header: () => t('learning.column.completion'),
        cell: (info) => <PercentCell value={info.getValue()} />,
        meta: { align: 'right' },
        sortUndefined: 'last',
      }),
      column.accessor('conceptMastery', {
        header: () => t('learning.column.mastery'),
        cell: (info) => <PercentCell value={info.getValue()} />,
        meta: { align: 'right' },
        sortUndefined: 'last',
      }),
      column.accessor('studentsNeedingAttention', {
        header: () => t('learning.column.attention'),
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11.5px] font-bold tabular-nums text-primary">
              {info.getValue()}
            </span>
          ) : (
            <Figure value={0} />
          ),
        meta: { align: 'right' },
      }),
      column.accessor('lastActivityAt', {
        header: () => t('learning.column.last_activity'),
        cell: (info) => {
          const value = info.getValue();
          if (!value) return <Missing />;
          return (
            <span className="whitespace-nowrap font-mono text-[11.5px] tabular-nums text-sub">
              {new Intl.DateTimeFormat(i18n.language, {
                month: 'short',
                day: 'numeric',
              }).format(new Date(value))}
            </span>
          );
        },
        meta: { align: 'right' },
        sortUndefined: 'last',
      }),
    ],
    [academyId, academySlug, highlightClassId, i18n.language, t],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className={cn(isStale && 'opacity-60 transition-opacity')}>
      {/* §16 — a wide table scrolls inside its own labelled region rather than
          making the page scroll sideways. `tabIndex` is what makes the region
          reachable by keyboard, which an overflow container is not by default. */}
      <div
        aria-label={t('learning.title')}
        className="overflow-x-auto"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[54rem] border-collapse text-[12.5px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr className="border-b border-border" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align === 'right';
                  return (
                    <th
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                      className={cn(
                        'bg-muted px-3 py-2 font-bold text-sub',
                        align ? 'text-right' : 'text-left',
                      )}
                      key={header.id}
                      scope="col"
                    >
                      <button
                        className={cn(
                          'inline-flex items-center gap-1 rounded transition-colors hover:text-ink',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          sorted && 'text-peer',
                          align && 'flex-row-reverse',
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortMark direction={sorted} />
                        <span className="sr-only">
                          {sorted === 'asc'
                            ? t('learning.sort_asc')
                            : sorted === 'desc'
                              ? t('learning.sort_desc')
                              : t('learning.sort_none')}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr
                className={cn(
                  'transition-colors hover:bg-accent/50',
                  // The highlighted class keeps a tint of the hue that named
                  // it, so the sentence above and the row below are visibly the
                  // same claim.
                  row.original.classId === highlightClassId && 'bg-teal/6',
                )}
                key={row.id}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    className={cn(
                      'px-3 py-2.5',
                      cell.column.columnDef.meta?.align === 'right' && 'text-right',
                    )}
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncated ? (
        <p className="border-t border-border px-4 py-2.5 text-[11.5px] text-sub">
          {t('learning.truncated', { count: rows.length })}
        </p>
      ) : null}
    </div>
  );
}

function SortMark({ direction }: { direction: false | 'asc' | 'desc' }) {
  const Icon =
    direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Icon
      aria-hidden
      className={cn('size-3', direction ? 'opacity-100' : 'opacity-40')}
      strokeWidth={2.5}
    />
  );
}

function Figure({ value }: { value: number }) {
  return <span className="font-mono tabular-nums">{value}</span>;
}

/** A measurement that was never taken, said rather than drawn as zero. */
function Missing() {
  const { t } = useTranslation('manager');
  return (
    <span className="text-sub" title={t('no_data')}>
      <span aria-hidden>—</span>
      <span className="sr-only">{t('no_data')}</span>
    </span>
  );
}

function PercentCell({ value }: { value: number | null }) {
  const { t } = useTranslation('manager');
  if (value === null) return <Missing />;
  return (
    <span className="font-mono tabular-nums">{t('percent', { value })}</span>
  );
}

function DurationCell({ seconds }: { seconds: number | null }) {
  const { t } = useTranslation('manager');
  const display = durationDisplay(seconds);
  if (display.kind === 'none') return <Missing />;
  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      {display.kind === 'hours'
        ? t('duration.hours', {
            hours: display.hours,
            minutes: display.minutes,
          })
        : t('duration.minutes', { minutes: display.minutes })}
    </span>
  );
}

/**
 * The rate, with a bar behind the number.
 *
 * A bar rather than a second column of figures: comparing ten percentages down
 * a column is a task, and comparing ten bar lengths is a glance. The figure
 * stays because the bar cannot be read to two significant figures.
 */
function RateCell({ percent }: { percent: number | null }) {
  const { t } = useTranslation('manager');
  if (percent === null) return <Missing />;
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-accent"
      >
        <span
          className="block h-full rounded-full bg-peer"
          style={{ width: meterWidth(percent) }}
        />
      </span>
      <span className="font-mono font-bold tabular-nums">
        {t('percent', { value: percent })}
      </span>
    </span>
  );
}
