'use client';

import {
  answerRecordResults,
  type AnswerRecordResult,
  type AnswerRecordRow,
  type AnswerRecordsResult,
} from '@cove/shared';
import {
  formatDateTime,
  formatNumber,
  formatPercent,
} from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Gauge,
  Send,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { DataTable } from '@/components/studio/data-table';
import type { TableFacet } from '@/components/studio/faceted-filter';
import { useLayoutTranslation, useLocale } from '@/i18n';

import { useAnswerRecords } from '../_hooks/use-answer-records';
import {
  recordPathSegments,
  recordResultTones,
  reviewHref,
  solveTimeDisplay,
} from '../_lib/answer-records-view';
import type { RecordsQuery } from '../_lib/records-url';

/** The five facets, in the order the toolbar prints them. */
const facetKeys = ['result', 'class', 'course', 'module', 'lecture'] as const;
type FacetKey = (typeof facetKeys)[number];

const facetQueryField: Record<FacetKey, keyof RecordsQuery> = {
  result: 'results',
  class: 'classIds',
  course: 'courseIds',
  module: 'moduleIds',
  lecture: 'lectureIds',
};

export function AnswerRecords({
  academyId,
  initialData,
}: {
  academyId: string;
  initialData: AnswerRecordsResult | null;
}) {
  const { t } = useLayoutTranslation(['learn', 'common']);
  const locale = useLocale();
  const records = useAnswerRecords({ academyId, initialData });
  const { data, query, returnTo } = records;

  const columns = React.useMemo<ColumnDef<AnswerRecordRow>[]>(
    () => [
      {
        id: 'problem',
        accessorFn: (row) => row.problemTitle,
        header: t('learn:records.column.problem'),
        cell: ({ row }) => (
          <ProblemCell academyId={academyId} returnTo={returnTo} row={row.original} />
        ),
      },
      {
        id: 'result',
        accessorFn: (row) => row.result,
        header: t('learn:records.column.result'),
        enableHiding: false,
        cell: ({ row }) => <ResultBadge result={row.original.result} />,
      },
      {
        id: 'score',
        accessorFn: (row) => row.score,
        header: t('learn:records.column.score'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.score}</span>
        ),
      },
      {
        id: 'tests',
        header: t('learn:records.column.tests'),
        enableSorting: false,
        // No meaningful order — 1/2 is not worse than 3/10 — but §14 makes it
        // one of the two columns a narrow screen may drop.
        meta: { hideable: true },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sub">
            {t('learn:records.tests_value', {
              passed: row.original.passedCount,
              total: row.original.totalCount,
            })}
          </span>
        ),
      },
      {
        id: 'solveTime',
        accessorFn: (row) => row.solveElapsedSec,
        header: t('learn:records.column.solve_time'),
        enableHiding: false,
        cell: ({ row }) => <SolveTimeCell seconds={row.original.solveElapsedSec} />,
      },
      {
        id: 'submitted',
        accessorFn: (row) => row.createdAt,
        header: t('learn:records.column.submitted'),
        enableHiding: false,
        cell: ({ row }) => (
          <time
            className="whitespace-nowrap text-sub"
            dateTime={row.original.createdAt}
          >
            {formatDateTime(row.original.createdAt, locale)}
          </time>
        ),
      },
      {
        id: 'review',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <ReviewLink academyId={academyId} returnTo={returnTo} row={row.original} />
        ),
      },
    ],
    [academyId, locale, returnTo, t],
  );

  const facets = React.useMemo<TableFacet[]>(() => {
    if (!data) return [];
    return [
      {
        columnId: 'result',
        title: t('learn:records.column.result'),
        options: answerRecordResults
          // Only what this history contains; an option that can never match
          // is a control that does nothing.
          .filter((result) => data.facets.results.includes(result))
          .map((result) => ({
            label: t(`learn:records.result.${result}`),
            value: result,
          })),
      },
      {
        columnId: 'class',
        title: t('learn:records.facet.class'),
        options: data.facets.classes,
      },
      {
        columnId: 'course',
        title: t('learn:records.facet.course'),
        options: data.facets.courses,
      },
      {
        columnId: 'module',
        title: t('learn:records.facet.module'),
        options: data.facets.modules,
      },
      {
        columnId: 'lecture',
        title: t('learn:records.facet.lecture'),
        options: data.facets.lectures,
      },
    ].map((facet) => ({
      ...facet,
      options: facet.options.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    }));
  }, [data, t]);

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      facetKeys.flatMap((key) => {
        const values = query[facetQueryField[key]] as string[];
        return values.length > 0 ? [{ id: key, value: values }] : [];
      }),
    [query],
  );

  const applyColumnFilters = React.useCallback(
    (next: ColumnFiltersState) => {
      const byId = new Map(next.map((filter) => [filter.id, filter.value]));
      records.change({
        results: (byId.get('result') as AnswerRecordResult[]) ?? [],
        classIds: (byId.get('class') as string[]) ?? [],
        courseIds: (byId.get('course') as string[]) ?? [],
        moduleIds: (byId.get('module') as string[]) ?? [],
        lectureIds: (byId.get('lecture') as string[]) ?? [],
      });
    },
    [records],
  );

  // The initial load failed with nothing to fall back on. A failure that
  // arrives while rows are on screen is handled below instead, so filters,
  // sorting, and page survive it.
  if (!data && records.failed) {
    return (
      <PageError
        message={t('learn:records.unavailable_body')}
        onRetry={records.retry}
        retryLabel={t('common:action.try_again')}
        title={t('learn:records.unavailable_title')}
      />
    );
  }

  if (!data) {
    return (
      <p aria-live="polite" className="py-14 text-center text-[14px] text-sub">
        {t('common:state.loading')}
      </p>
    );
  }

  const untouched =
    query.q === '' &&
    facetKeys.every(
      (key) => (query[facetQueryField[key]] as string[]).length === 0,
    );

  return (
    <div className="flex flex-col gap-5">
      <SummaryCards summary={data.summary} />

      {/* A failure with rows already on screen keeps them: the reader's
          filters, sorting, and page are still perfectly good. */}
      {records.failed ? (
        <p
          className="flex flex-wrap items-center gap-3 rounded-card border border-danger/25 bg-danger/5 px-4 py-2.5 text-[13px] font-semibold text-danger"
          role="alert"
        >
          {t('learn:records.refresh_failed')}
          <button
            className="rounded-md border border-danger/30 px-2 py-0.5 text-[12.5px] font-bold transition-colors hover:bg-danger/10"
            onClick={records.retry}
            type="button"
          >
            {t('common:action.try_again')}
          </button>
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={data.rows}
        emptyMessage={
          untouched
            ? t('learn:records.empty_body')
            : t('learn:records.no_results')
        }
        facets={facets}
        loadingLabel={t('common:state.loading')}
        manual={{
          pageIndex: data.pagination.page - 1,
          pageCount: data.pagination.pageCount,
          rowCount: data.pagination.totalCount,
          sorting: query.sort
            ? [{ id: query.sort, desc: query.direction === 'desc' }]
            : [],
          globalFilter: query.q,
          columnFilters,
          pending: records.pending,
          onPageIndexChange: (pageIndex) => records.setPage(pageIndex + 1),
          onSortingChange: (sorting) => {
            const active = sorting[0];
            records.change(
              active
                ? {
                    sort: active.id as RecordsQuery['sort'],
                    direction: active.desc ? 'desc' : 'asc',
                  }
                : { sort: null, direction: 'desc' },
            );
          },
          onGlobalFilterChange: (value) => records.change({ q: value }),
          onColumnFiltersChange: applyColumnFilters,
        }}
        pageSize={data.pagination.pageSize}
        searchPlaceholder={t('learn:records.search_placeholder')}
        showColumnVisibility={false}
      />

      {untouched && data.pagination.totalCount === 0 ? (
        <EmptyHistory academyId={academyId} />
      ) : null}
    </div>
  );
}

/**
 * The three whole-history metrics.
 *
 * Deliberately not three identical tiles. Two of these are counts and the
 * third is a proportion, and rendering them the same way hides that: the
 * accepted rate is the only one with a denominator, so it is the only one that
 * carries a meter. The asymmetry is the information.
 *
 * The meter stays brand-coloured at every value rather than turning red below
 * some threshold. This is a learning history, not a grade — §4 rules out
 * ranking a student, and a bar that goes red at 40% ranks them.
 */
function SummaryCards({
  summary,
}: {
  summary: AnswerRecordsResult['summary'];
}) {
  const { t } = useLayoutTranslation('learn');
  const locale = useLocale();

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <SummaryCard
        // The icon on the Submit button that produced every one of these rows.
        icon={Send}
        label={t('records.summary.total')}
        meaning={t('records.summary.total_caption')}
        metric="total"
        value={formatNumber(summary.totalSubmissions, locale)}
      />
      <SummaryCard
        icon={CircleCheck}
        label={t('records.summary.solved')}
        // Answers the question the number provokes: 132 attempts, 1 solved.
        meaning={t('records.summary.solved_caption')}
        metric="solved"
        tone="success"
        value={formatNumber(summary.solvedProblems, locale)}
      />
      <SummaryCard
        icon={Gauge}
        label={t('records.summary.rate')}
        metric="rate"
        percent={summary.acceptedRate}
        value={formatPercent(summary.acceptedRate / 100, locale)}
      />
    </dl>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  meaning,
  metric,
  percent,
  tone = 'neutral',
  value,
}: {
  icon: LucideIcon;
  label: string;
  /** One line saying what the number counts. Omitted when a meter says it. */
  meaning?: string;
  metric: 'total' | 'solved' | 'rate';
  /** 0-100, and only for the proportion — the one metric that has one. */
  percent?: number;
  /** The single accent this strip spends, and it goes on the achievement. */
  tone?: 'neutral' | 'success';
  value: string;
}) {
  const { t } = useLayoutTranslation('learn');

  return (
    <div className="flex flex-col rounded-card border border-border bg-card px-4 py-3.5">
      <dt className="flex items-center gap-2">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-lg ${
            tone === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-accent text-sub'
          }`}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-sub">
          {label}
        </span>
      </dt>

      {/* Equal heights across the row, so the meter on the third card lines up
          with the captions on the first two rather than floating. */}
      <dd className="mt-2.5 flex flex-1 flex-col justify-between gap-2.5">
        <span
          className="block text-[1.75rem] font-extrabold leading-none tabular-nums"
          data-testid={`records-summary-${metric}`}
        >
          {value}
        </span>

        {percent === undefined ? (
          <span className="block text-[12px] leading-[1.45] text-sub">
            {meaning}
          </span>
        ) : (
          <span
            aria-label={t('records.summary.rate_label', { percent: value })}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="block h-1.5 overflow-hidden rounded-full bg-accent"
            role="progressbar"
          >
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </dd>
    </div>
  );
}

function ProblemCell({
  academyId,
  returnTo,
  row,
}: {
  academyId: string;
  returnTo: string;
  row: AnswerRecordRow;
}) {
  const { number, path } = recordPathSegments(row);
  const title = (
    <span className="font-semibold">
      {number ? (
        <span className="mr-1.5 font-mono text-[12.5px] text-sub">{number}</span>
      ) : null}
      {row.problemTitle}
    </span>
  );

  return (
    <div className="min-w-0 max-w-[22rem]">
      {row.canOpenExercise ? (
        <Link
          className="rounded-sm underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
          href={reviewHref({
            academyId,
            materialId: row.materialId,
            submissionId: row.submissionId,
            returnTo,
          })}
        >
          {title}
        </Link>
      ) : (
        title
      )}
      <p className="truncate text-[12.5px] text-sub">{path.join(' › ')}</p>
    </div>
  );
}

function ResultBadge({ result }: { result: AnswerRecordResult }) {
  const { t } = useLayoutTranslation('learn');
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${recordResultTones[result]}`}
    >
      {t(`records.result.${result}`)}
    </span>
  );
}

function SolveTimeCell({ seconds }: { seconds: number | null }) {
  const { t } = useLayoutTranslation('learn');
  const display = solveTimeDisplay(seconds);

  if (display.kind === 'missing') {
    return (
      <span className="text-sub" title={t('records.solve_time_missing')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('records.solve_time_missing')}</span>
      </span>
    );
  }

  const text =
    display.kind === 'hours'
      ? t('records.duration.hours', {
          hours: display.hours,
          minutes: display.minutes,
        })
      : display.kind === 'minutes'
        ? t('records.duration.minutes', {
            minutes: display.minutes,
            seconds: display.seconds,
          })
        : t('records.duration.seconds', { seconds: display.seconds });

  return (
    <span
      aria-label={t('records.solve_time_label', { duration: text })}
      className="whitespace-nowrap font-mono tabular-nums"
    >
      {text}
    </span>
  );
}

function ReviewLink({
  academyId,
  returnTo,
  row,
}: {
  academyId: string;
  returnTo: string;
  row: AnswerRecordRow;
}) {
  const { t } = useLayoutTranslation('learn');

  // Disabled, not hidden: the record stays readable, and why the problem
  // became unreachable is deliberately not explained.
  if (!row.canOpenExercise) {
    return (
      <span className="whitespace-nowrap text-[12.5px] text-sub">
        {t('records.unavailable_problem')}
      </span>
    );
  }

  return (
    <Link
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 text-[13px] font-bold text-brand underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
      href={reviewHref({
        academyId,
        materialId: row.materialId,
        submissionId: row.submissionId,
        returnTo,
      })}
    >
      {t('records.review')}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function EmptyHistory({ academyId }: { academyId: string }) {
  const { t } = useLayoutTranslation('learn');
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-card px-6 py-14 text-center">
      <ClipboardList className="size-8 text-sub/40" />
      <h2 className="mt-3 text-[15px] font-bold">{t('records.empty_title')}</h2>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-sub">
        {t('records.empty_body')}
      </p>
      <Link
        className="mt-4 inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13.5px] font-bold text-on-brand transition-opacity hover:opacity-90"
        href={`/studio/academies/${academyId}/learn/courses`}
      >
        {t('records.empty_action')}
      </Link>
    </div>
  );
}

function PageError({
  message,
  onRetry,
  retryLabel,
  title,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <div className="rounded-card border border-danger/25 bg-danger/5 p-5" role="alert">
      <h2 className="text-[15px] font-bold text-danger">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-6 text-sub">{message}</p>
      <button
        className="mt-3 inline-flex h-9 items-center rounded-lg border border-danger/30 px-3 text-[13.5px] font-bold text-danger transition-colors hover:bg-danger/10"
        onClick={onRetry}
        type="button"
      >
        {retryLabel}
      </button>
    </div>
  );
}
