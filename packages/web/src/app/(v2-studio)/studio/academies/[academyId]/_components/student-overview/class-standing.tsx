'use client';

import {
  standingSharePercent,
  type ClassStanding,
  type StandingRow,
  type StudentOverviewClass,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Users2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { cn } from '@/lib/utils';

import { EmptyState, Panel, Percent } from './student-primitives';

/**
 * Where the student sits in one class.
 *
 * This is the only section on the page that says anything about anyone else,
 * and almost every decision in it is about keeping that true in the smallest
 * possible way.
 *
 * There is no name on any row. Not hidden, not truncated, not behind a
 * setting — the row this component renders has no name field, because the
 * schema that produced it has none. Turning this into a leaderboard is not a
 * change to this file; it is a deliberate edit to a contract in `@cove/shared`
 * whose comment says why it must not happen.
 *
 * It shows the leading three and the rows either side of the reader, never the
 * complete class. A complete list ends, and something has to be last, and a
 * child opening their own overview should not be told they are the something.
 * The positions therefore jump — 1, 2, 3, then 6, 7, 8 — and the line under
 * the table says so, because an unexplained gap reads as a bug.
 *
 * The reader's own row is marked with a ring and a word, not a fill. A filled
 * row would read as a prize, and this section is deliberately the quietest
 * colour on the page for the same reason: it is information about where the
 * work is, not a ribbon.
 *
 * The footnote is load-bearing. A child who cannot see what decided the order
 * will invent an explanation, and the honest one — problems solved, then
 * score, then days present, and explicitly *not* time spent — is also the one
 * that tells them what to do next.
 *
 * See §9 of the student academy overview design.
 */
export function ClassStandingPanel({
  classes,
  isStale,
  onClassChange,
  standing,
}: {
  classes: StudentOverviewClass[];
  isStale: boolean;
  onClassChange: (classId: string) => void;
  standing: ClassStanding;
}) {
  const { t } = useTranslation('learning');

  const picker =
    classes.length > 1 ? (
      <label className="inline-flex items-center gap-2">
        <span className="sr-only">{t('standing.pick_class')}</span>
        <select
          className={cn(
            'h-8 rounded-lg border border-border bg-card px-2 text-[12.5px] font-semibold',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isStale && 'pointer-events-none opacity-50',
          )}
          onChange={(event) => onClassChange(event.target.value)}
          value={standing.classId}
        >
          {classes.map((entry) => (
            <option key={entry.classId} value={entry.classId}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  if (!standing.eligible) {
    return (
      <Panel
        actions={picker}
        icon={Users2}
        id="standing"
        testId="class-standing"
        title={t('standing.title')}
        tone="brand"
      >
        <EmptyState
          body={t(`standing.ineligible_${standing.reason}_body`, {
            count: standing.needed,
          })}
          icon={Users2}
          title={t(`standing.ineligible_${standing.reason}_title`)}
          tone="brand"
        />
      </Panel>
    );
  }

  const share = standingSharePercent({
    position: standing.yourPosition,
    participants: standing.participants,
  });

  // A position already shown at the top is not repeated below it.
  const shownPositions = new Set(standing.top.map((row) => row.position));
  const rows = [
    ...standing.top,
    ...standing.neighbourhood.filter((row) => !shownPositions.has(row.position)),
  ];
  const hasGap = rows.some(
    (row, index) => index > 0 && row.position > rows[index - 1].position + 1,
  );

  const columns: ColumnDef<StandingRow, unknown>[] = [
    {
      id: 'position',
      header: t('standing.column_position'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-[15px] font-bold tabular-nums">
            {row.original.position}
          </span>
          {row.original.isYou ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11.5px] font-bold text-brand">
              {t('standing.you')}
            </span>
          ) : (
            <>
              <span aria-hidden className="h-1 w-6 rounded-full bg-border" />
              <span className="sr-only">{t('standing.anonymous')}</span>
            </>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'solvedProblems',
      header: () => <NumericHeader>{t('standing.column_solved')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <NumericCell>{row.original.solvedProblems}</NumericCell>,
    },
    {
      accessorKey: 'averageScore',
      header: () => <NumericHeader>{t('standing.column_score')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell>
          <Percent value={row.original.averageScore} />
        </NumericCell>
      ),
    },
    {
      accessorKey: 'activeDays',
      header: () => <NumericHeader>{t('standing.column_days')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell className="text-sub">{row.original.activeDays}</NumericCell>
      ),
    },
  ];

  return (
    <Panel
      actions={picker}
      description={t('standing.description')}
      icon={Users2}
      id="standing"
      meta={t('standing.meta', { count: standing.participants })}
      testId="class-standing"
      title={t('standing.title')}
      tone="brand"
    >
      <div className="border-b border-border px-4 py-3.5">
        <p className="text-[14px] leading-[1.55]">
          {t('standing.summary', {
            position: standing.yourPosition,
            participants: standing.participants,
          })}
        </p>
        {share !== null ? (
          <p className="mt-1 text-[12.5px] text-sub">
            {t('standing.share', { value: share })}
          </p>
        ) : null}
      </div>

      <DataTable
        // Sorting is off on every column on purpose. The order is the claim
        // this section makes; a reader who could re-sort it would be reading a
        // different measurement under the same heading.
        className="[&_table]:min-w-[420px] [&_tbody_tr]:h-12"
        columns={columns}
        data={rows}
        frameless
        rowClassName={(row) =>
          row.isYou
            ? 'bg-brand/[0.05] outline outline-1 -outline-offset-1 outline-brand/25'
            : undefined
        }
        showColumnVisibility={false}
      />

      <div className="border-t border-border px-4 py-3 text-[11.5px] leading-[1.55] text-sub">
        {hasGap ? <p>{t('standing.gap')}</p> : null}
        <p className={hasGap ? 'mt-1' : undefined}>{t('standing.footnote')}</p>
      </div>
    </Panel>
  );
}

function NumericHeader({ children }: { children: React.ReactNode }) {
  return <span className="block text-right">{children}</span>;
}

function NumericCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'block text-right font-mono text-[13px] font-semibold tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}
