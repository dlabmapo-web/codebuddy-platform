'use client';

import type { PointAwardRow, PointsLedgerPage } from '@cove/shared';
import { POINTS_LEDGER_PAGE_SIZE } from '@cove/shared';
import { formatDate, formatNumber } from '@cove/i18n/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt, Sparkles, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';
import { orpc } from '@/lib/orpc';

import { EmptyState, Panel, toneStyles } from '../../_components/overview-ui/panel';
import { reasonIcons, reasonTones } from '../_lib/points-view';

/**
 * Every line, and where it came from.
 *
 * An earlier draft styled this as a printed receipt — perforated edge, mono
 * column, running total — on the argument that points are money-adjacent and a
 * child trusts a system they can audit. It was cut: the page already spends
 * its boldness on the season plate, two signature elements compete rather than
 * compound, and the tabular figures the house style already uses give the
 * audit quality without the costume.
 *
 * ## Why this is a pager and not a "Show more"
 *
 * It was an infinite list, and that only works while the list is short. A
 * student three months into a term has several hundred rows, and their teacher
 * answering "why does 지호 have forty points" was made to press a button and
 * scroll, repeatedly, with no idea how much was left — the one interaction
 * that gets slower the more a child has worked. A pager states the size of the
 * thing up front, and every page after the first costs one click instead of
 * `n`.
 *
 * The rows stay on screen while the next page loads (`keepPreviousData`), so
 * turning a page never blanks the panel.
 *
 * Voided rows are shown, struck through, with their reason. A correction a
 * student cannot see is a correction they cannot question.
 *
 * `initialPage` is `null` when the server's own ledger read failed. That is a
 * different thing from an empty ledger and must never render as one, so the
 * query is left to run client-side — which doubles as the retry — and only a
 * second failure prints the apology. §12.3.
 *
 * `membershipId` is set only by staff reading a student's history. A student
 * never passes one: their own membership comes from the identity, and the API
 * ignores the field for them. §5.1.
 */
export function PointLedger({
  academyId,
  classId,
  initialPage,
  membershipId,
  today,
}: {
  academyId: string;
  classId?: string | null;
  initialPage: PointsLedgerPage | null;
  membershipId?: string;
  /** The academy's current local date, so one row can say so. */
  today?: string;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const [pageIndex, setPageIndex] = React.useState(0);

  const ledger = useQuery({
    queryKey: [
      'points-ledger',
      academyId,
      classId ?? 'first',
      membershipId ?? 'self',
      pageIndex,
    ],
    queryFn: () =>
      orpc.points.listLedger({
        academyId,
        ...(classId ? { classId } : {}),
        ...(membershipId ? { membershipId } : {}),
        page: pageIndex + 1,
        pageSize: POINTS_LEDGER_PAGE_SIZE,
      }),
    // Only the first page matches what the server already rendered.
    ...(initialPage && pageIndex === 0 ? { initialData: initialPage } : {}),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const columns = React.useMemo<ColumnDef<PointAwardRow>[]>(
    () => [
      {
        id: 'date',
        header: t('ledger.column.date'),
        enableSorting: false,
        size: 148,
        cell: ({ row }) => {
          const date = row.original.localDate;
          return (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[13px] tabular-nums text-sub">
                {date ? formatDate(date, locale) : '—'}
              </span>
              {date && date === today ? (
                <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10.5px] font-bold text-success">
                  {t('ledger.today')}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'reason',
        header: t('ledger.column.reason'),
        enableSorting: false,
        cell: ({ row }) => <ReasonCell row={row.original} />,
      },
      {
        id: 'amount',
        header: t('ledger.column.amount'),
        enableSorting: false,
        size: 110,
        cell: ({ row }) => (
          <span
            className={cn(
              'font-mono text-[14px] font-bold tabular-nums',
              row.original.voided ? 'text-sub line-through' : 'text-success',
            )}
          >
            {t('ledger.amount', {
              points: formatNumber(row.original.amount, locale),
            })}
          </span>
        ),
      },
    ],
    [locale, t, today],
  );

  const data = ledger.data;
  const rows = data?.rows ?? [];

  if (ledger.isError && !data) {
    return (
      <Panel icon={Receipt} title={t('ledger.title')} tone="success">
        <EmptyState
          body={t('ledger.unavailable')}
          icon={TriangleAlert}
          title={t('ledger.title')}
          tone="danger"
        />
      </Panel>
    );
  }

  if (data && data.totalRows === 0) {
    return (
      <Panel icon={Receipt} title={t('ledger.title')} tone="success">
        <EmptyState
          body={t('ledger.empty_hint')}
          icon={Sparkles}
          title={t('ledger.empty')}
          tone="success"
        />
      </Panel>
    );
  }

  return (
    <Panel
      icon={Receipt}
      // The panel states its own denominator, the way every panel in this
      // product does: how many lines there are in total, not how many are on
      // this page. It is also the number the old "Show more" never told anyone.
      meta={
        data ? t('board.participants', { count: data.totalRows }) : undefined
      }
      title={t('ledger.title')}
      tone="success"
    >
      <DataTable
        className="p-4"
        columns={columns}
        data={rows}
        frameless
        loadingLabel={t('ledger.title')}
        manual={{
          pageIndex,
          pageCount: data
            ? Math.max(1, Math.ceil(data.totalRows / data.pageSize))
            : 1,
          rowCount: data?.totalRows ?? 0,
          // The ledger is a chronological record and the server orders it. No
          // sorting, no search, no facets: a student auditing their own week
          // reads it in the order it happened, and every control that is not
          // here is one that cannot disagree with the server.
          sorting: [],
          globalFilter: '',
          columnFilters: [],
          pending: ledger.isFetching,
          onPageIndexChange: setPageIndex,
          onSortingChange: () => {},
          onGlobalFilterChange: () => {},
          onColumnFiltersChange: () => {},
        }}
      />
    </Panel>
  );
}

/**
 * What happened, in the words it happened in.
 *
 * The reason line says the fact; the line beneath carries what it was about —
 * the frozen subject label, the difficulty as a word, and whether the daily cap
 * trimmed it. Difficulty is never a colour: three difficulty hues beside seven
 * reason hues is a palette nobody can learn.
 */
function ReasonCell({ row }: { row: PointAwardRow }) {
  const { t } = useTranslation('points');
  const Icon = reasonIcons[row.reason];
  const tone = toneStyles[reasonTones[row.reason]];

  const detail = [
    row.reason === 'LEARNING_TIME' ? null : row.subjectLabel,
    row.difficulty ? t(`difficulty.${row.difficulty}`) : null,
    row.capped ? t('ledger.capped') : null,
    row.voided ? (row.voidReason ?? t('ledger.voided')) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl',
          tone.chip,
          row.voided && 'opacity-50',
        )}
      >
        <Icon className="size-[1.05rem]" strokeWidth={2.25} />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13.5px] font-semibold text-ink',
            row.voided && 'text-sub line-through',
          )}
        >
          {t(`ledger.reason.${row.reason}`, { label: row.subjectLabel })}
        </span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[12px] text-sub">
            {detail}
          </span>
        ) : null}
      </span>
    </span>
  );
}
