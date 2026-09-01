'use client';

import type { PlatformAcademySummary } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { formatShortDate } from '@cove/i18n/format';
import {
  ArrowRight,
  CircleCheck,
  CircleSlash,
  PauseCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocale } from '@/i18n';
import { routes } from '@/lib/routes';

import { academyCondition } from '../_lib/platform-view';
import { AcademyRowActions } from './academy-row-actions';
import { AcademyStateBadge } from './academy-state-badge';

/**
 * Every academy, in the table the rest of the product uses.
 *
 * The same `DataTable` a manager reads their classes and people in — so search,
 * facets, sorting, paging, and the column menu all behave the way they already
 * learned them, and the console inherits every fix that table gets.
 *
 * `state` is faceted on the resolved condition rather than on the raw status
 * column. An operator filtering for trouble is looking for "no manager", which
 * is not a status any academy row stores: it is status and manager state read
 * together, and a facet over `status` alone could not express it.
 */
export function AcademyTable({
  academies,
  toolbarActions,
}: {
  academies: PlatformAcademySummary[];
  toolbarActions?: React.ReactNode;
}) {
  const { t } = useTranslation('platform');
  const locale = useLocale();
  const isMobile = useIsMobile();
  const router = useRouter();

  const columns = React.useMemo<ColumnDef<PlatformAcademySummary>[]>(
    () => [
      {
        id: 'academy',
        accessorFn: (record) => `${record.name} ${record.slug}`,
        header: t('table.name'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-ink">
              {row.original.name}
            </span>
            {/* The operator's handle for an academy is its slug: it is what
                they type, what a link carries, and what a support message
                quotes. Mono so it scans down the column as one shape. */}
            <span className="block truncate font-mono text-[12px] text-sub">
              /{row.original.slug}
            </span>
          </div>
        ),
      },
      {
        id: 'state',
        accessorFn: (record) => academyCondition(record),
        filterFn: 'arrIncludesSome',
        header: t('table.state'),
        cell: ({ row }) => <AcademyStateBadge academy={row.original} />,
      },
      {
        id: 'people',
        accessorFn: (record) => record.memberCounts.total,
        header: t('table.people'),
        cell: ({ row }) => (
          <span
            className={`font-mono text-[15px] tabular-nums ${
              row.original.memberCounts.total === 0
                ? 'text-sub/50'
                : 'font-bold text-ink'
            }`}
          >
            {row.original.memberCounts.total}
          </span>
        ),
      },
      {
        id: 'created',
        accessorFn: (record) => record.createdAt,
        header: t('table.created'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.createdAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('table.actions'),
        enableSorting: false,
        size: 150,
        cell: ({ row }) => <AcademyRowActions academy={row.original} />,
      },
    ],
    [locale, t],
  );

  return (
    <DataTable
      columns={
        // Five columns do not fit a phone, and the date is the one an operator
        // can lose without losing the row's meaning.
        isMobile ? columns.filter((column) => column.id !== 'created') : columns
      }
      data={academies}
      // A filtered-empty table must not claim the platform has no academies.
      emptyMessage={
        academies.length === 0 ? t('table.empty') : t('table.empty_filtered')
      }
      facets={[
        {
          columnId: 'state',
          title: t('table.state'),
          options: [
            { label: t('condition.running'), value: 'running', icon: CircleCheck },
            {
              label: t('condition.no_active_manager'),
              value: 'no_active_manager',
              icon: CircleSlash,
            },
            {
              label: t('condition.awaiting_first_manager'),
              value: 'awaiting_first_manager',
              icon: CircleSlash,
            },
            {
              label: t('condition.suspended'),
              value: 'suspended',
              icon: PauseCircle,
            },
            {
              label: t('condition.archived'),
              value: 'archived',
              icon: CircleSlash,
            },
          ],
        },
      ]}
      onRowClick={(row) => router.push(routes.adminAcademy(row.slug))}
      pageSize={10}
      searchPlaceholder={t('table.search')}
      toolbarActions={toolbarActions}
    />
  );
}
