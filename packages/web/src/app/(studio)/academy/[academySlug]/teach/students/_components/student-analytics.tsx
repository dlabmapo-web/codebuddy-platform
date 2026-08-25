'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import {
  STUDENT_PAGE_SIZES,
  overviewAttentionKinds,
  studentSortKeys,
  type OverviewAttentionKind,
  type OverviewAttentionReason,
  type TeacherStudentList,
  type TeacherStudentRow,
} from '@cove/shared';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  BookMarked,
  CalendarDays,
  CircleAlert,
  FileCode2,
  FileText,
  Info,
  Layers,
  Presentation,
  Target,
  Timer,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { FacetedFilter } from '@/components/studio/faceted-filter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/studio/overlays';
import { cn } from '@/lib/utils';

import {
  Avatar,
  Meter,
} from '../../../_components/teacher-overview/overview-primitives';
import {
  attentionIcons,
  attentionReasonDisplayValue,
  attentionTones,
  durationDisplay,
  formatLocalDate,
} from '../../../_lib/overview-view';
import { FilterSelector } from '../../../_components/teacher-overview/filter-selector';
import { RangePicker } from '../../../_components/teacher-overview/range-picker';
import { solutionStatusPath } from '../../../_lib/overview-url';
import {
  useDebounced,
  useStudentsState,
  useTeacherStudentsQuery,
} from '../_hooks/use-teacher-students';
import { optionsForParent, type StudentsQuery } from '../_lib/students-url';

/**
 * Student analytics: one table, and the controls that decide what is in it.
 *
 * The table is the page. §7.1 rules out putting a dashboard above it, and the
 * reason is that this page answers a different kind of question from the
 * overview — not "what should I do next" but "show me the evidence" — and a row
 * of summary tiles above the evidence would push the evidence below the fold to
 * repeat what the previous page already said.
 *
 * Sorting and paging are the server's. The muted number beside each name is
 * `offset + index + 1` over the complete filtered result, so it is the
 * student's position among every matching student rather than among the
 * twenty-five on screen. TanStack owns the interaction; it does not own the
 * order.
 *
 * See §7 of the teacher overview and student analytics redesign.
 */
export function StudentAnalytics({
  academyId,
  initialData,
  initialKey,
}: {
  academyId: string;
  initialData: TeacherStudentList | null;
  initialKey: string;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teaching');
  const { query, change } = useStudentsState(academyId);

  // The box is local and the query is debounced, so typing feels immediate
  // while the server sees one request for a name rather than one per letter.
  const [searchInput, setSearchInput] = React.useState(query.search);
  const debouncedSearch = useDebounced(searchInput, 300);
  React.useEffect(() => {
    if (debouncedSearch !== query.search) change({ search: debouncedSearch });
    // `query.search` is deliberately absent: adopting a URL change here would
    // fight the effect that writes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const list = useTeacherStudentsQuery(academyId, query, initialData, initialKey);
  const data = list.data;

  const columns = React.useMemo(
    () => studentColumns({ academySlug, t }),
    [academySlug, t],
  );

  const sorting: SortingState = [
    { id: query.sort, desc: query.direction === 'desc' },
  ];

  if (list.isError && !data) {
    return (
      <div className="rounded-card border border-danger/25 bg-danger/5 p-4" role="alert">
        <p className="text-[13px] font-bold text-danger">
          {t('unavailable.title')}
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-sub">
          {t('unavailable.body')}
        </p>
        <button
          className="mt-3 inline-flex h-8 items-center rounded-md border border-danger/30 px-2.5 text-[12.5px] font-bold text-danger transition-colors hover:bg-danger/10"
          onClick={() => void list.refetch()}
          type="button"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StudentFilters
        change={change}
        filters={data?.filters}
        query={query}
        scope={data?.scope}
      />

      <DataTable
        className="[&_tbody_td]:whitespace-nowrap [&_tbody_tr]:h-[4.25rem]"
        columns={columns as ColumnDef<TeacherStudentRow, unknown>[]}
        data={data?.rows ?? []}
        emptyMessage={t('table.empty')}
        // §12 — the measurement that is currently sorted and the student it
        // belongs to always stay; a supporting figure moves behind the Columns
        // control rather than off the edge of a card with nothing saying so.
        initialColumnVisibility={{
          activeDays: false,
          lastActive: false,
          submissions: false,
        }}
        loadingLabel={t('loading')}
        manual={{
          pageIndex: (data?.page ?? query.page) - 1,
          pageCount: data?.pageCount ?? 1,
          rowCount: data?.totalRows ?? 0,
          sorting,
          globalFilter: searchInput,
          columnFilters: [],
          pending: list.isFetching || list.isPlaceholderData,
          onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
          onSortingChange: (next) => {
            const first = next[0];
            if (!first) return;
            const sort = studentSortKeys.find((key) => key === first.id);
            if (!sort) return;
            change({ sort, direction: first.desc ? 'desc' : 'asc' });
          },
          onGlobalFilterChange: setSearchInput,
          onColumnFiltersChange: () => {},
        }}
        pageSize={query.pageSize}
        searchPlaceholder={t('table.search')}
        toolbarFilters={
          // The Studio's own facet chip, the same control the management tables
          // use. Multi-select is its nature and it is also the right model here:
          // "stalled or inactive" is one question a teacher asks, and answering
          // it one reason at a time turns one glance into two.
          <FacetedFilter
            onSelectedChange={(values) =>
              change({
                attention: values.filter((value): value is OverviewAttentionKind =>
                  (overviewAttentionKinds as readonly string[]).includes(value),
                ),
              })
            }
            options={overviewAttentionKinds.map((kind) => ({
              icon: attentionIcons[kind],
              label: t(`table.attention_kind.${kind}`),
              value: kind,
            }))}
            selected={query.attention}
            // The browser holds one page, so a count taken from it would read
            // as a fact about the whole roster.
            showCounts={false}
            title={t('table.attention')}
          />
        }
        toolbarActions={
          <PageSizeControl
            onChange={(pageSize) => change({ pageSize })}
            value={query.pageSize}
          />
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- columns */

type Translate = ReturnType<typeof useTranslation<'teaching'>>['t'];

/**
 * A column heading, with a mark in the hue its measurement wears everywhere.
 *
 * The hues are not new here: teal is time, green is score, violet is a student,
 * amber is a watch signal — the same vocabulary the overview establishes. A
 * teacher who learned it there reads this table faster, and the icon does the
 * work colour alone cannot, per §12.
 */
function heading(label: string, Icon: LucideIcon, tone: string, numeric = false) {
  return function ColumnHeading() {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          numeric && 'w-full justify-end',
        )}
      >
        <Icon aria-hidden className={cn('size-3.5 shrink-0', tone)} />
        {label}
      </span>
    );
  };
}

/** The reason's own mark, so the closed chip already says which reason it is. */
function PrimaryReasonIcon({ kind }: { kind: OverviewAttentionKind }) {
  const Icon = attentionIcons[kind];
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}

/** A measurement, right-aligned so the column reads as a column of figures. */
function Num({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('block text-right font-mono tabular-nums', className)}>
      {children}
    </span>
  );
}

/** Not measured. Never a zero, which is a different and much stronger claim. */
function NotMeasured({ t }: { t: Translate }) {
  return (
    <span className="text-sub/60" title={t('no_data')}>
      <span aria-hidden>—</span>
      <span className="sr-only">{t('no_data')}</span>
    </span>
  );
}

function studentColumns(input: {
  academySlug: string;
  t: Translate;
}): ColumnDef<TeacherStudentRow>[] {
  const { academySlug, t } = input;

  return [
    {
      id: 'name',
      accessorKey: 'displayName',
      header: heading(t('table.student'), UserRound, 'text-peer'),
      meta: { label: t('table.student') },
      enableHiding: false,
      cell: ({ row }) => {
        const href = solutionStatusPath({
          academySlug,
          classId: row.original.primaryClassId,
          membershipId: row.original.membershipId,
        });
        const body = (
          <>
            <span
              className="w-5 shrink-0 text-right font-mono text-[11.5px] font-semibold tabular-nums text-sub"
              data-testid="student-current-rank"
              title={t('table.order_tooltip')}
            >
              {row.original.order}
            </span>
            <Avatar
              id={row.original.membershipId}
              name={row.original.displayName}
              size="sm"
            />
            <span className="truncate font-semibold">
              {row.original.displayName}
            </span>
          </>
        );
        return href ? (
          <Link
            className="flex items-center gap-2.5 text-ink transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={href}
          >
            {body}
          </Link>
        ) : (
          <span className="flex items-center gap-2.5">{body}</span>
        );
      },
    },
    {
      id: 'classes',
      header: heading(t('table.class'), Users, 'text-sub'),
      meta: { hideable: true, label: t('table.class') },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.classes.length === 0 ? (
          <span className="text-sub">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.original.classes.map((entry) => (
              <span
                className="rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-semibold text-sub"
                key={entry.value}
              >
                {entry.label}
              </span>
            ))}
          </span>
        ),
    },
    {
      id: 'score',
      accessorKey: 'averageScore',
      header: heading(t('table.score'), Target, 'text-success', true),
      meta: { label: t('table.score') },
      cell: ({ row }) =>
        row.original.averageScore === null ? (
          <Num>
            <NotMeasured t={t} />
          </Num>
        ) : (
          // §7.4 — the score never travels without its coverage. 100% over one
          // problem and 100% over twenty are not the same claim, and printing
          // the first alone is how a teacher comes to believe the second.
          <span className="flex w-full flex-col items-end gap-1">
            <span className="whitespace-nowrap font-mono tabular-nums">
              <span className="font-bold text-success">
                {t('percent', { value: row.original.averageScore })}
              </span>
              <span className="ml-1.5 text-[11.5px] text-sub">
                {t('table.over_attempted', {
                  count: row.original.attemptedProblems,
                })}
              </span>
            </span>
            <span className="w-16">
              <Meter
                label={t('table.score')}
                percent={row.original.averageScore}
                tone="success"
              />
            </span>
          </span>
        ),
    },
    {
      id: 'solved',
      accessorKey: 'solvedProblems',
      header: heading(t('table.solved'), CircleAlert, 'text-brand', true),
      meta: { label: t('table.solved') },
      cell: ({ row }) => (
        <Num>
          <span className="font-bold text-ink">
            {row.original.solvedProblems}
          </span>
          <span className="text-sub"> / {row.original.attemptedProblems}</span>
        </Num>
      ),
    },
    {
      id: 'submissions',
      accessorKey: 'submissions',
      header: heading(t('table.submissions'), FileText, 'text-peer', true),
      meta: { label: t('table.submissions') },
      cell: ({ row }) => <Num>{row.original.submissions}</Num>,
    },
    {
      id: 'activeTime',
      accessorKey: 'activeSeconds',
      header: heading(t('table.active_time'), Timer, 'text-teal', true),
      meta: { label: t('table.active_time') },
      cell: ({ row }) => (
        <Num className="font-semibold text-teal">
          <ActiveTime seconds={row.original.activeSeconds} />
        </Num>
      ),
    },
    {
      id: 'activeDays',
      header: heading(t('table.active_days'), CalendarDays, 'text-teal', true),
      meta: { hideable: true, label: t('table.active_days') },
      enableSorting: false,
      cell: ({ row }) => (
        <Num className="text-sub">{row.original.activeDays}</Num>
      ),
    },
    {
      id: 'lastActive',
      accessorKey: 'lastActivityAt',
      header: heading(t('table.last_active'), Info, 'text-sub', true),
      meta: { label: t('table.last_active') },
      cell: ({ row }) => (
        <Num className="text-[12.5px] text-sub">
          <LastActive at={row.original.lastActivityAt} />
        </Num>
      ),
    },
    {
      id: 'attention',
      header: heading(t('table.attention'), CircleAlert, 'text-warning'),
      meta: { hideable: true, label: t('table.attention') },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.reasons.length === 0 ? (
          <span className="text-sub/60">—</span>
        ) : (
          <AttentionReasons reasons={row.original.reasons} t={t} />
        ),
    },
  ];
}

/**
 * Keeps the roster scannable while leaving every measured reason one click
 * away. Portalled content cannot stretch or be clipped by the table scroller.
 */
function AttentionReasons({
  reasons,
  t,
}: {
  reasons: OverviewAttentionReason[];
  t: Translate;
}) {
  const primary = reasons[0]!;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t('table.attention_open', { count: reasons.length })}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-bold tabular-nums',
            'transition-[box-shadow,transform] hover:shadow-sm active:translate-y-px',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            attentionTones[primary.kind],
          )}
          type="button"
        >
          <PrimaryReasonIcon kind={primary.kind} />
          {t('table.attention_count', { count: reasons.length })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-[13px] font-bold text-ink">
          {t('table.attention_details')}
        </p>
        <ul className="mt-2 space-y-1.5">
          {reasons.map((reason) => (
            <li
              className={cn(
                'rounded-lg px-2.5 py-2 text-[12.5px] font-semibold leading-5 tabular-nums',
                attentionTones[reason.kind],
              )}
              key={reason.kind}
            >
              {t(`queue.reason.${reason.kind}`, {
                count: attentionReasonDisplayValue(reason),
              })}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Counted time, spoken as a person would, with the raw seconds still available.
 *
 * §12 — the exact figure is on the element for assistive technology while the
 * visible text stays "4h 42m", because second-level precision on an estimate
 * would claim an accuracy the heartbeat model does not have.
 */
function ActiveTime({ seconds }: { seconds: number }) {
  const { t } = useTranslation('teaching');
  const display = durationDisplay(seconds);
  if (display.kind === 'none') {
    return (
      <span className="text-sub" title={t('duration.none')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('duration.none')}</span>
      </span>
    );
  }
  return (
    <span
      aria-label={t('table.seconds', { count: seconds })}
      className="whitespace-nowrap font-mono tabular-nums"
    >
      {display.kind === 'hours'
        ? t('duration.hours', {
            hours: display.hours,
            minutes: display.minutes,
          })
        : t('duration.minutes', { minutes: display.minutes })}
    </span>
  );
}

function LastActive({ at }: { at: string | null }) {
  const { t, i18n } = useTranslation('teaching');
  if (!at) return <span className="text-sub">{t('never')}</span>;
  return (
    <time className="whitespace-nowrap font-mono text-[12.5px] tabular-nums" dateTime={at}>
      {new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(at))}
    </time>
  );
}

/* ---------------------------------------------------------------- filters */

/**
 * The dependent chain, as five pickers that appear as they become answerable.
 *
 * A module picker with no course selected has nothing authorized to list, so it
 * is absent rather than disabled: a control that can never be used is noise on
 * a page that already has ten of them, and its absence is what teaches the
 * chain — pick a course, and the next question appears.
 */
function StudentFilters({
  change,
  filters,
  query,
  scope,
}: {
  change: (partial: Partial<StudentsQuery>) => void;
  filters: TeacherStudentList['filters'] | undefined;
  query: StudentsQuery;
  scope: TeacherStudentList['scope'] | undefined;
}) {
  const { t, i18n } = useTranslation('teaching');
  const courses = query.classId
    ? (filters?.courses ?? []).filter((course) =>
        course.classIds.includes(query.classId!),
      )
    : (filters?.courses ?? []);
  const modules = optionsForParent(filters?.modules ?? [], query.courseId);
  const lectures = optionsForParent(filters?.lectures ?? [], query.moduleId);
  const problems = optionsForParent(filters?.problems ?? [], query.lectureId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelector
          allLabel={t('filters.all_classes')}
          icon={Users}
          label={t('filters.class')}
          onChange={(classId) => change({ classId })}
          options={filters?.classes ?? []}
          value={query.classId}
        />
        <FilterSelector
          allLabel={t('filters.all_courses')}
          disabled={courses.length === 0}
          icon={Layers}
          label={t('filters.course')}
          onChange={(courseId) => change({ courseId })}
          options={courses}
          value={query.courseId}
        />
        {modules.length > 0 ? (
          <FilterSelector
            allLabel={t('filters.all_modules')}
            icon={BookMarked}
            label={t('filters.module')}
            onChange={(moduleId) => change({ moduleId })}
            options={modules}
            value={query.moduleId}
          />
        ) : null}
        {lectures.length > 0 ? (
          <FilterSelector
            allLabel={t('filters.all_lectures')}
            icon={Presentation}
            label={t('filters.lecture')}
            onChange={(lectureId) => change({ lectureId })}
            options={lectures}
            value={query.lectureId}
          />
        ) : null}
        {problems.length > 0 ? (
          <FilterSelector
            allLabel={t('filters.all_problems')}
            icon={FileCode2}
            label={t('filters.problem')}
            onChange={(problemId) => change({ problemId })}
            options={problems}
            value={query.problemId}
          />
        ) : null}

        <RangePicker
          onChange={(range) => change({ range })}
          period={scope?.period}
          value={query.range}
        />
      </div>

      {scope ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-[1.6] text-sub">
          <Info aria-hidden className="size-3.5 shrink-0" />
          {t('table.scoped_problems', { count: scope.scopedProblems })}
          {scope.activityTrackedSince ? (
            <>
              <span aria-hidden>·</span>
              {t('scope.tracked_since', {
                date: formatLocalDate(scope.activityTrackedSince, i18n.language),
              })}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function PageSizeControl({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  const { t } = useTranslation('teaching');
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t('table.page_size')}</span>
      <select
        className="h-10 rounded-lg border border-border bg-card px-2.5 text-[13.5px] font-semibold text-sub transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onChange={(event) => onChange(Number(event.target.value))}
        value={value}
      >
        {STUDENT_PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {t('table.rows_per_page', { count: size })}
          </option>
        ))}
      </select>
    </label>
  );
}
