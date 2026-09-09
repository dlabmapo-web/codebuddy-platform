'use client';

import type { StaleProblemRow } from '@cove/shared';
import { STALE_PROBLEMS_MAX } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { cn } from '@/lib/utils';

/**
 * Problems whose grading moved on without their submissions.
 *
 * First on the page, and the only panel that answers a question nobody asked.
 * An operator usually arrives holding a teacher's report about one problem —
 * but the same edit that broke theirs broke every other problem edited the same
 * way, and none of those has anybody reporting it.
 *
 * Sorted by students affected rather than by course order: the number of people
 * currently looking at a wrong record is the only ordering that matches what an
 * operator should do first.
 */
export function StaleBoard({
  academyChosen,
  loading,
  onSelect,
  rows,
  selectedMaterialId,
  truncated,
}: {
  academyChosen: boolean;
  loading: boolean;
  onSelect: (row: StaleProblemRow) => void;
  rows: StaleProblemRow[];
  selectedMaterialId: string | null;
  /** More problems are stale than the server returned. Said, never hidden. */
  truncated: boolean;
}) {
  const { t } = useTranslation('platform-operations');

  const columns = React.useMemo<ColumnDef<StaleProblemRow>[]>(
    () => [
      {
        accessorKey: 'problemTitle',
        header: t('board.problem'),
        cell: ({ row }) => (
          <span className="font-semibold text-ink">
            {row.original.problemTitle}
          </span>
        ),
      },
      {
        id: 'location',
        // An accessor, not just a cell: sorting reads the accessor, and a
        // column that renders three fields would otherwise be the one column
        // an operator cannot order the table by. Course first, so sorting here
        // groups a course's broken problems together — which is how somebody
        // working through a teacher's report reads this table.
        accessorFn: (row) =>
          `${row.courseTitle} ${row.moduleTitle} ${row.lectureTitle}`,
        header: t('board.location'),
        cell: ({ row }) => (
          <span className="text-[13px] text-sub">
            {row.original.courseTitle} · {row.original.moduleTitle} ·{' '}
            {row.original.lectureTitle}
          </span>
        ),
      },
      {
        accessorKey: 'studentCount',
        header: t('board.students'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums font-bold text-ink">
            {row.original.studentCount}
          </span>
        ),
      },
      {
        accessorKey: 'staleCount',
        header: t('board.submissions'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sub">
            {row.original.staleCount}
          </span>
        ),
      },
      {
        // Hidden, and here only so the Course chip has a column to narrow.
        // `arrIncludesSome` compares what the chip carries against what the
        // cell holds, so the accessor is the title the chip is labelled with.
        id: 'course',
        accessorFn: (row) => row.courseTitle,
        filterFn: 'arrIncludesSome',
        header: t('board.course'),
      },
      {
        id: 'module',
        accessorFn: (row) => row.moduleTitle,
        filterFn: 'arrIncludesSome',
        header: t('board.module'),
      },
      {
        accessorKey: 'currentRevision',
        header: t('board.revision'),
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sub">
            {row.original.currentRevision}
          </span>
        ),
      },
      {
        id: 'action',
        header: '',
        // The one column with nothing to order by. Left sortable, its menu
        // would offer to sort a table by a button.
        enableSorting: false,
        cell: ({ row }) =>
          row.original.inFlightRunId ? (
            <span className="text-[13px] font-semibold text-brand">
              {t('board.in_flight')}
            </span>
          ) : (
            <Button
              onClick={() => onSelect(row.original)}
              size="sm"
              variant="outline"
            >
              {t('board.action')}
            </Button>
          ),
      },
    ],
    [onSelect, t],
  );

  // Built from the rows on screen rather than from a fixed list: a chip
  // offering a course with nothing broken in it is a dead end, and the set is
  // small — only courses that actually have stale work appear here.
  const facets = React.useMemo(() => {
    const distinct = (pick: (row: StaleProblemRow) => string) =>
      [...new Set(rows.map(pick))]
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ label: value, value }));
    return [
      { columnId: 'course', title: t('board.course'), options: distinct((row) => row.courseTitle) },
      { columnId: 'module', title: t('board.module'), options: distinct((row) => row.moduleTitle) },
    ].filter((facet) => facet.options.length > 1);
  }, [rows, t]);

  return (
    <section className="grid gap-3">
      <div>
        {/* Arrives ordered by students affected, descending — `staleProblems`
            sorts it in SQL, which is the order somebody working through a
            report wants first. Every column is sortable from there. */}
        <h2 className="text-[16px] font-bold text-ink">{t('board.title')}</h2>
        <p className="mt-0.5 max-w-3xl text-[13.5px] text-sub">
          {t('board.description')}
        </p>
      </div>
      {!academyChosen ? (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-[14px] text-sub">
          {t('academy.placeholder')}
        </p>
      ) : rows.length === 0 && !loading ? (
        <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
          <p className="text-[15px] font-semibold text-ink">
            {t('board.empty')}
          </p>
          <p className="mt-1 text-[13.5px] text-sub">{t('board.empty_hint')}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          emptyMessage={t('board.no_match')}
          facets={facets}
          // The two columns that exist only to be narrowed by a chip. Their
          // values are already printed in "Where it sits", so showing them
          // would say everything twice.
          initialColumnVisibility={{ course: false, module: false }}
          loadingLabel={loading ? t('regrade.planning') : undefined}
          pageSize={15}
          searchPlaceholder={t('board.search')}
          rowClassName={(row) =>
            cn(
              row.materialId === selectedMaterialId &&
                'bg-brand-soft/60 hover:bg-brand-soft/60',
            )
          }
          showColumnVisibility={false}
        />
      )}
      {truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-sub">
          {t('board.truncated', { count: STALE_PROBLEMS_MAX })}
        </p>
      ) : null}
    </section>
  );
}
