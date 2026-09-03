'use client';

import type {
  ListPlatformRankingResult,
  PlatformRankedClass,
  PointsPeriodKind,
  RankingSortKey,
} from '@cove/shared';
import { pointsPeriodKinds } from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { AlertTriangle, Trophy } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { RankingSummary } from './ranking-summary';
import { RankingBoard } from './ranking-board';
import {
  useRankingQuery,
  useRankingState,
} from '../../_hooks/use-platform-ranking';

/**
 * Every academy's classes, ordered by what their students earned.
 *
 * The manager's ranking page with one question in front of it. A manager holds
 * one academy and picks a class; an operator holds none, so this picks the
 * class out of every academy first — and then mounts the *same* board, from the
 * same procedure, so a manager and an operator comparing screens never see two
 * different third places.
 *
 * ## Two levels, and the top one never ranks children
 *
 * The table ranks classes by aggregate; the board beneath ranks students inside
 * one class. §10.2 is why: a child can move a position in a room of eighteen
 * and cannot move one in an academy of four hundred. So no column here carries
 * a child's name — not the leader, not the top scorer. That is available one
 * click down, bounded by a class, where it means something.
 *
 * ## Colour
 *
 * One hue for the page, as the content browser does it: `primary`, which is
 * the hue the board already wears and the Trophy already marks. Loudness stays
 * per row and stays rare — a class with points switched off, a platform with
 * more classes than one pass may aggregate.
 */
export function RankingTable({
  initialData,
  initialKey,
}: {
  initialData: ListPlatformRankingResult | null;
  initialKey: string;
}) {
  const { t } = useTranslation('platform-ranking');
  const locale = useLocale();

  const { query, path, change } = useRankingState();
  const result = useRankingQuery(query, initialData, initialKey);
  const page = result.data;

  const columns = React.useMemo<ColumnDef<PlatformRankedClass>[]>(
    () => [
      {
        id: 'class',
        header: t('table.class'),
        enableHiding: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-ink">
              {row.original.name}
            </span>
            <span className="block truncate text-[12px] text-sub">
              {row.original.teacherName ?? t('table.no_teacher')}
            </span>
          </div>
        ),
      },
      {
        id: 'academy',
        header: t('table.academy'),
        size: 156,
        meta: { hideable: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {row.original.academyName}
            </span>
            <span className="block truncate font-mono text-[12px] text-sub">
              /{row.original.academySlug}
            </span>
          </div>
        ),
      },
      {
        id: 'students',
        header: t('table.students'),
        size: 96,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <span className="font-mono text-[15px] font-bold tabular-nums text-ink">
            {formatNumber(row.original.students, locale)}
          </span>
        ),
      },
      {
        id: 'earning',
        header: t('table.earning'),
        size: 116,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <EarningCell
            earning={row.original.earningStudents}
            students={row.original.students}
          />
        ),
      },
      {
        id: 'points',
        header: t('table.points'),
        size: 116,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <Measurement locale={locale} value={row.original.points} unit="P" />
        ),
      },
      {
        id: 'solved',
        header: t('table.solved'),
        enableSorting: false,
        size: 96,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <Measurement locale={locale} value={row.original.solvedProblems} />
        ),
      },
      {
        id: 'state',
        header: t('table.state'),
        enableSorting: false,
        size: 120,
        meta: { hideable: true },
        cell: ({ row }) => <StateChip state={row.original.state} />,
      },
    ],
    [locale, t],
  );

  const facets = React.useMemo(
    () => [
      {
        columnId: 'academy',
        title: t('table.academy'),
        options: (page?.academyOptions ?? []).map((academy) => ({
          label: academy.name,
          value: academy.id,
        })),
      },
    ],
    [page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      query.academyIds?.length
        ? [{ id: 'academy', value: query.academyIds }]
        : [],
    [query.academyIds],
  );

  /**
   * The single academy the facet is narrowed to, if it is narrowed to one.
   *
   * Read from the same `academyOptions` the facet is built from, so the strip
   * and the chip can never name the academy differently.
   */
  const scopedAcademy =
    query.academyIds?.length === 1
      ? (page?.academyOptions.find(
          (option) => option.id === query.academyIds?.[0],
        ) ?? null)
      : null;

  const rowCount = page?.total ?? 0;
  const selected =
    page?.rows.find((row) => row.classId === query.classId) ?? null;

  /** Selecting a row opens its board; selecting it again closes it. */
  const select = React.useCallback(
    (row: PlatformRankedClass) =>
      change(
        row.classId === query.classId
          ? { classId: null, academyId: null }
          : { classId: row.classId, academyId: row.academyId },
      ),
    [change, query.classId],
  );

  return (
    <div className="grid gap-5">
      {page?.summary ? (
        <RankingSummary
          academy={scopedAcademy}
          period={query.period}
          summary={page.summary}
        />
      ) : null}

      <Panel
        actions={
          <PeriodToggle
            onSelect={(period) => change({ period })}
            value={query.period}
          />
        }
        icon={Trophy}
        // A string, so a filter that matches nothing still states "0". As a
        // number, zero is falsy and the pill vanishes exactly when the operator
        // most needs to be told the count is real.
        meta={String(rowCount)}
        title={t('table.title')}
        tone="primary"
      >
        {page?.truncated ? (
          <p
            className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3.5 py-2.5 text-[13px] font-semibold text-warning"
            role="status"
          >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t('table.truncated')}
          </p>
        ) : null}

        <DataTable
          className="p-4"
          columns={columns as ColumnDef<never>[]}
          data={(page?.rows ?? []) as never[]}
          emptyMessage={t('table.empty')}
          facets={facets}
          frameless
          layout="fixed"
          loadingLabel={t('table.loading')}
          manual={{
            pageIndex: query.page - 1,
            pageCount: Math.max(1, Math.ceil(rowCount / query.pageSize)),
            rowCount,
            sorting: [{ id: query.sort, desc: query.direction === 'desc' }],
            globalFilter: query.query ?? '',
            columnFilters,
            pending: result.isFetching,
            onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
            onSortingChange: (sorting) => {
              const next = sorting[0];
              change(
                next
                  ? {
                      sort: next.id as RankingSortKey,
                      direction: next.desc ? 'desc' : 'asc',
                    }
                  : { sort: 'points', direction: 'desc' },
              );
            },
            onGlobalFilterChange: (value) => change({ query: value }),
            onColumnFiltersChange: (filters) =>
              change({ academyIds: facetSelection(filters, 'academy') }),
          }}
          onRowClick={select as (row: never) => void}
          // The selected row takes the tint and inset rail the board uses to
          // mark "your row", because it is the same statement: this is the one
          // you are looking at.
          rowClassName={((row: PlatformRankedClass) =>
            row.classId === query.classId
              ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--brand)] hover:bg-brand-soft'
              : undefined) as (row: never) => string | undefined}
          searchPlaceholder={t('table.search')}
          showColumnVisibility
        />
      </Panel>

      {query.classId && query.academyId ? (
        <RankingBoard
          academyId={query.academyId}
          academyName={selected?.academyName ?? null}
          academySlug={selected?.academySlug ?? null}
          classId={query.classId}
          className={selected?.name ?? null}
          from={path}
          onClose={() => change({ classId: null, academyId: null })}
          onSelectPeriod={(period) => change({ period })}
          period={query.period}
          // A class whose academy switched points off has no board to draw, and
          // the reason is a fact the table already knows. Passing it down means
          // the board explains itself rather than reporting a refusal.
          state={selected?.state ?? null}
        />
      ) : null}
    </div>
  );
}

/**
 * How much of the class is actually working, not just how many are on the roll.
 *
 * A bare count of earners is unreadable without the roster beside it: 9 is most
 * of a class of twelve and a quarter of a class of thirty-six. The denominator
 * is the smaller, quieter half of the pair, so the column still scans as one
 * measurement down the page.
 *
 * Zero earners is the condition an operator is looking for, so it is the one
 * value here that takes colour.
 */
function EarningCell({
  earning,
  students,
}: {
  earning: number;
  students: number;
}) {
  const locale = useLocale();
  const none = earning === 0 && students > 0;
  return (
    <span className="font-mono text-[15px] tabular-nums">
      <span className={cn('font-bold', none ? 'text-warning' : 'text-ink')}>
        {formatNumber(earning, locale)}
      </span>
      <span className="text-[12.5px] text-sub">
        {' / '}
        {formatNumber(students, locale)}
      </span>
    </span>
  );
}

/**
 * A measurement, or an em dash when there is none to make.
 *
 * Null is "this academy switched points off", which is not zero. Printing `0`
 * would sort a manager's decision next to a failing class and read as one —
 * the em dash is the house rule for a missing measurement on every points
 * surface, and the reason the contract carries a nullable rather than a count.
 */
function Measurement({
  locale,
  unit,
  value,
}: {
  locale: ReturnType<typeof useLocale>;
  unit?: string;
  value: number | null;
}) {
  const { t } = useTranslation('platform-ranking');
  if (value === null) {
    return (
      <span className="font-mono text-[15px] tabular-nums text-sub/50">
        <span aria-hidden>—</span>
        <span className="sr-only">{t('table.not_counted')}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-mono text-[15px] tabular-nums',
        value === 0 ? 'text-sub/50' : 'font-bold text-ink',
      )}
    >
      {formatNumber(value, locale)}
      {unit && value !== 0 ? (
        <span className="ml-0.5 text-[12px] font-semibold text-sub">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Whether this class can be ranked, and why not.
 *
 * `StateBadge`'s shape, with three states instead of two — and the middle one
 * is why it is not that component: points switched off is a *decision a manager
 * made*, not a fault, so it wears `warning` rather than danger. A console that
 * drew a customer's configuration in red would send operators chasing
 * conditions nobody wants changed.
 */
function StateChip({ state }: { state: PlatformRankedClass['state'] }) {
  const { t } = useTranslation('platform-ranking');
  const tone =
    state === 'ranked'
      ? 'bg-success/10 text-success'
      : state === 'board_off'
        ? 'bg-muted text-sub'
        : 'bg-warning/10 text-warning';
  const dot =
    state === 'ranked'
      ? 'bg-success'
      : state === 'board_off'
        ? 'bg-sub'
        : 'bg-warning';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold',
        tone,
      )}
      title={t(`state.${state}_hint`)}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {t(`state.${state}`)}
    </span>
  );
}

/**
 * 오늘 / 이번 주 / 이번 달 — the same control the manager's ranking page and the
 * student's own page carry, so one product has one period control.
 *
 * It drives the table's aggregates *and* the board below it. Two period
 * controls on one screen showing two different weeks is a bug report waiting to
 * be filed.
 */
function PeriodToggle({
  onSelect,
  value,
}: {
  onSelect: (period: PointsPeriodKind) => void;
  value: PointsPeriodKind;
}) {
  const { t } = useTranslation('points');
  return (
    <div
      aria-label={t('period.label')}
      className="inline-flex rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-card)]"
      role="tablist"
    >
      {pointsPeriodKinds.map((kind) => (
        <button
          aria-selected={kind === value}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
            kind === value
              ? 'bg-brand text-on-brand'
              : 'text-sub hover:bg-brand-soft hover:text-brand',
          )}
          key={kind}
          onClick={() => onSelect(kind)}
          role="tab"
          type="button"
        >
          {t(`period.${kind}`)}
        </button>
      ))}
    </div>
  );
}
