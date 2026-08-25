'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { CourseReachRow } from '@cove/shared';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, BookPlus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { courseHref } from '../../_lib/lead-view';
import { durationDisplay } from '../../_lib/overview-view';
import { EmptyState } from '../overview-ui/panel';

/**
 * Every course, and how far it actually reaches.
 *
 * The manager's control tower compares classes; this compares courses, and that
 * difference is the difference between the two jobs. A class is a room of
 * people and a course is a thing somebody wrote, and only one of them can be
 * rewritten on a Tuesday afternoon.
 *
 * Sorted with TanStack, on the same header idiom as the control tower's class
 * table — client-side, because unlike the people directory this data is already
 * in hand: the payload carries at most a hundred rows and asking the server to
 * re-run every academy aggregate to reorder them would be a round trip to sort
 * an array. The default order is the shared comparator's, so the first thing a
 * Team Lead sees is taught courses by least complete rather than an alphabet.
 *
 * ## Why there are no charts in here
 *
 * Each row used to carry two miniature graphics — the visibility spine at
 * course scale, and a completion meter — on the argument that repeating the
 * page's signature device costs a reader nothing once they have learned it.
 * That argument holds for a device a reader meets on its own. It does not hold
 * inside a seven-column table: two bars per row across a dozen rows is two
 * dozen small pictures competing with the numbers beside them, and a reader
 * comparing courses has to decode a shape to recover a figure that was already
 * printed underneath it.
 *
 * So the table is figures only. Every measurement is set in tabular figures
 * with its denominator under it, right-aligned so the columns compare down the
 * page rather than across it — which is the comparison this table exists for.
 * The spine still opens the page, where it is the subject rather than a
 * decoration on somebody else's row.
 *
 * Shelved courses are marked and never sorted to the top. A course reaching no
 * class is not a defect — it is where authoring effort went — and the blocker
 * queue above deliberately does not carry it.
 */

const column = createColumnHelper<CourseReachRow>();

export function CourseReach({
  academyId,
  courses,
  truncated,
}: {
  academyId: string;
  courses: CourseReachRow[];
  truncated: boolean;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');
  // Empty rather than a column: the payload already arrives in the shared
  // comparator's order, and seeding a sort here would silently replace it.
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => [
      column.accessor('title', {
        header: () => t('reach.column.course'),
        cell: (info) => (
          <Link
            className="group flex min-w-0 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={courseHref(academySlug, info.row.original.courseId)}
          >
            <span className="truncate font-semibold group-hover:text-brand">
              {info.getValue()}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 empty:hidden">
              {!info.row.original.isVisible ? (
                <Tag tone="bg-retired/10 text-retired">{t('reach.tag_hidden')}</Tag>
              ) : null}
              {info.row.original.shelved ? (
                <Tag tone="bg-draft/10 text-draft">{t('reach.tag_shelved')}</Tag>
              ) : null}
            </span>
          </Link>
        ),
      }),
      column.accessor('liveExercises', {
        header: () => t('reach.column.content'),
        cell: (info) => <ContentCell course={info.row.original} />,
        meta: { align: 'right' },
      }),
      column.accessor('classes', {
        header: () => t('reach.column.classes'),
        cell: (info) => <Figure value={info.getValue()} />,
        meta: { align: 'right' },
      }),
      column.accessor('studentsReached', {
        header: () => t('reach.column.students'),
        cell: (info) => (
          <Figure
            sub={t('reach.students_sub', {
              active: info.row.original.activeStudents,
            })}
            value={info.getValue()}
          />
        ),
        meta: { align: 'right' },
      }),
      column.accessor((row) => row.completion.percent, {
        id: 'completion',
        header: () => t('reach.column.completion'),
        cell: (info) => <CompletionCell course={info.row.original} />,
        meta: { align: 'right' },
        // A course nobody was asked to take sorts last rather than as nought.
        sortUndefined: 'last',
      }),
      column.accessor('medianActiveSeconds', {
        header: () => t('reach.column.median_time'),
        cell: (info) => <MedianCell seconds={info.getValue()} />,
        meta: { align: 'right' },
        sortUndefined: 'last',
      }),
      column.accessor((row) => row.dropOff?.readiness ?? null, {
        id: 'dropOff',
        header: () => t('reach.column.drop_off'),
        cell: (info) => <DropOffCell course={info.row.original} />,
        sortUndefined: 'last',
      }),
    ],
    [academySlug, t],
  );

  const table = useReactTable({
    columns,
    data: courses,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  if (courses.length === 0) {
    return (
      <EmptyState
        body={t('reach.empty_body')}
        icon={BookPlus}
        title={t('reach.empty_title')}
        tone="success"
      />
    );
  }

  return (
    <div>
      {/* A wide table scrolls inside its own labelled region rather than making
          the page scroll sideways. `tabIndex` is what makes the region reachable
          by keyboard, which an overflow container is not by default. */}
      <div
        aria-label={t('reach.table_label')}
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
                          'group inline-flex items-center gap-1 rounded transition-colors hover:text-ink',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          sorted && 'text-success',
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
                            ? t('reach.sort_asc')
                            : sorted === 'desc'
                              ? t('reach.sort_desc')
                              : t('reach.sort_none')}
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
              <tr className="transition-colors hover:bg-accent/50" key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    className={cn(
                      'px-3 py-2.5 align-middle',
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
        <p className="px-4 py-3 text-[11.5px] font-semibold text-sub">
          {t('reach.truncated')}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- cells */

/** How much of the course is in front of students, as a fraction. */
function ContentCell({ course }: { course: CourseReachRow }) {
  const { t } = useTranslation('lead');
  const total = course.liveExercises + course.hiddenExercises;

  if (total === 0) {
    return <Missing label={t('reach.no_exercises')} />;
  }

  return (
    <Figure
      sub={t('reach.content_sub')}
      value={t('reach.content_figure', { live: course.liveExercises, total })}
    />
  );
}

function CompletionCell({ course }: { course: CourseReachRow }) {
  const { t } = useTranslation('lead');
  if (course.completion.percent === null) {
    // Not "0%". A course assigned to no class has not been completed nought
    // percent — it has not been asked.
    return <Missing label={t('reach.no_students')} />;
  }
  return (
    <Figure
      sub={t('reach.completion_sub', {
        solved: course.completion.solved,
        possible: course.completion.possible,
      })}
      value={t('reach.completion_percent', {
        percent: course.completion.percent,
      })}
    />
  );
}

/** The lecture a course loses students at, named rather than drawn. */
function DropOffCell({ course }: { course: CourseReachRow }) {
  const { t } = useTranslation('lead');
  if (!course.dropOff) return <Missing label={t('reach.no_drop_off')} />;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-semibold text-ink">
        {course.dropOff.outlineNumber ? `${course.dropOff.outlineNumber} ` : ''}
        {course.dropOff.lectureTitle}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-warning">
        {t('reach.drop_off_value', {
          from: course.dropOff.previousReadiness,
          to: course.dropOff.readiness,
        })}
      </span>
    </span>
  );
}

function MedianCell({ seconds }: { seconds: number | null }) {
  const { t } = useTranslation('lead');
  const display = durationDisplay(seconds);
  if (display.kind === 'none') return <Missing label={t('reach.no_time')} />;
  return (
    <Figure
      value={
        display.kind === 'minutes'
          ? t('reach.minutes', { minutes: display.minutes })
          : t('reach.hours', { hours: display.hours, minutes: display.minutes })
      }
    />
  );
}

/**
 * One measurement: the figure, and the denominator it was measured against.
 *
 * The same shape in every numeric column, so a reader learns to read this table
 * once. The denominator is set smaller and quieter rather than dropped — a
 * table of bare percentages is one whose numbers cannot be checked, and "40%"
 * over three students and "40%" over three hundred are not the same claim.
 */
function Figure({ sub, value }: { sub?: string; value: React.ReactNode }) {
  return (
    <span className="flex flex-col items-end">
      <span className="font-mono font-bold tabular-nums text-ink">{value}</span>
      {sub ? (
        <span className="font-mono text-[11px] tabular-nums text-sub">{sub}</span>
      ) : null}
    </span>
  );
}

/** A measurement that was never taken, said rather than drawn as zero. */
function Missing({ label }: { label: string }) {
  return (
    <span className="text-sub" title={label}>
      <span aria-hidden>—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The sort arrow, shown only where it says something.
 *
 * A permanent arrow on all seven headers is seven marks competing with seven
 * words, on a control most readers never touch. The sorted column keeps its
 * arrow because that one is a statement about the table's current state; the
 * rest surface under the pointer or on keyboard focus, which is when the
 * affordance is being looked for.
 */
function SortMark({ direction }: { direction: false | 'asc' | 'desc' }) {
  const Icon =
    direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-3 transition-opacity motion-reduce:transition-none',
        direction
          ? 'opacity-100'
          : 'opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40',
      )}
      strokeWidth={2.5}
    />
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        tone,
      )}
    >
      {children}
    </span>
  );
}
