'use client';

import type { OperationRun } from '@cove/shared';
import { formatDate, formatTime } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { runSentence } from './run-progress';

/**
 * What has been run, and how it went.
 *
 * The reason a run is a row in the database rather than a toast. An operator
 * who pressed a button an hour ago and wants to know whether it worked has
 * nowhere else to look: BullMQ knows a job ran, and knows nothing about the
 * person who caused it or the forty-six others that belonged to the same press.
 */
export function RunTable({
  runs,
  showAcademy,
}: {
  runs: OperationRun[];
  /**
   * Off inside one academy, where every row would repeat its name.
   *
   * The console keeps it: an operator reading the platform's history needs to
   * know which customer each run was about, and it is the column they scan.
   */
  showAcademy: boolean;
}) {
  const { t } = useTranslation('platform-operations');
  const locale = useLocale();

  const columns = React.useMemo<ColumnDef<OperationRun>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: t('runs.when'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13px] text-sub">
            {formatDate(row.original.startedAt ?? row.original.createdAt, locale)}{' '}
            {formatTime(row.original.startedAt ?? row.original.createdAt, locale)}
          </span>
        ),
      },
      {
        accessorKey: 'actorName',
        header: t('runs.who'),
        cell: ({ row }) => (
          <span className="text-[13.5px] text-ink">{row.original.actorName}</span>
        ),
      },
      ...(showAcademy
        ? [
            {
              accessorKey: 'academyName',
              header: t('runs.academy'),
              cell: ({ row }) => (
                <span className="text-[13.5px] text-sub">
                  {row.original.academyName}
                </span>
              ),
            } satisfies ColumnDef<OperationRun>,
          ]
        : []),
      {
        id: 'target',
        // Sorted by the title as printed, with deleted problems grouping
        // together under the empty string rather than scattering.
        accessorFn: (row) => row.targetTitle ?? '',
        header: t('runs.what'),
        cell: ({ row }) => (
          <span
            className={cn(
              'text-[13.5px]',
              row.original.targetTitle ? 'text-ink' : 'italic text-sub',
            )}
          >
            {row.original.targetTitle ?? t('runs.deleted_target')}
          </span>
        ),
      },
      {
        id: 'progress',
        // Ordered by how much a run actually repaired, which is the question
        // somebody scanning this column has. Sorting by the rendered sentence
        // would order them alphabetically, which means nothing.
        accessorFn: (row) => row.completedCount,
        header: t('runs.progress'),
        cell: ({ row }) => {
          const sentence = runSentence(row.original);
          const { key, ...values } = sentence;
          return (
            <span className="text-[13px] text-sub">
              {t(key, values as Record<string, number>)}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('runs.state'),
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[12px] font-bold',
              row.original.status === 'FAILED'
                ? 'bg-danger-soft text-danger'
                : row.original.status === 'RUNNING'
                  ? 'bg-brand-soft text-brand'
                  : 'bg-accent text-sub',
            )}
          >
            {t(`status.${row.original.status}`)}
          </span>
        ),
      },
    ],
    [locale, showAcademy, t],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-[16px] font-bold text-ink">{t('runs.title')}</h2>
      <DataTable
        columns={columns}
        data={runs}
        emptyMessage={t('runs.empty')}
        pageSize={10}
        searchPlaceholder={t('runs.search')}
        showColumnVisibility={false}
      />
    </section>
  );
}
