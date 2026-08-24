'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { useLocale } from '@/i18n';
import {
  compareLiveState,
  studentSearchText,
  type RosterRow,
} from '@/lib/monitoring/roster';

import { LiveStateBadge } from '../../../_components/live-badges';

/**
 * The roster as a table, in the same shape as every other studio list.
 *
 * Rows arrive already ordered by `sortRoster` — solving first, because a
 * teacher opens this page to find somebody to help. The table starts with no
 * sorting of its own, so that order is what a teacher sees on arrival and a
 * header click is what overrides it.
 */
export function RosterTable({
  academyId,
  classId,
  rows,
  emptyMessage,
  filters,
}: {
  academyId: string;
  classId: string;
  rows: RosterRow[];
  emptyMessage: string;
  /** The state pills, which sit in the toolbar beside the search box. */
  filters?: React.ReactNode;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();

  const relative = React.useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    [locale],
  );

  const columns = React.useMemo<ColumnDef<RosterRow>[]>(
    () => [
      {
        id: 'student',
        // All three identifiers in one accessor, which is what makes the
        // table's own search cover a username without a second filter.
        accessorFn: studentSearchText,
        header: t('roster.column_student'),
        cell: ({ row }) => {
          const student = row.original;
          return (
            <div className="min-w-0 max-w-xs">
              <p className="truncate text-[14.5px] font-bold">
                {student.displayName ?? student.email ?? student.membershipId}
              </p>
              <p className="truncate text-[13px] text-sub">
                {student.active
                  ? (student.username ? `@${student.username}` : student.email)
                  : t('roster.membership_inactive')}
              </p>
            </div>
          );
        },
      },
      {
        id: 'state',
        accessorFn: (row) => row.state,
        header: t('roster.column_state'),
        sortingFn: (left, right) =>
          compareLiveState(left.original.state, right.original.state),
        cell: ({ row }) => <LiveStateBadge state={row.original.state} />,
      },
      {
        id: 'exercise',
        accessorFn: (row) => (row.materialId ? 1 : 0),
        header: t('roster.column_exercise'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13px] text-sub">
            {row.original.materialId
              ? t('roster.in_exercise')
              : t('roster.no_exercise')}
          </span>
        ),
      },
      {
        id: 'activity',
        accessorFn: (row) => row.lastLearningSeenAt ?? '',
        header: t('roster.column_activity'),
        cell: ({ row }) => (
          // "9 minutes ago" is computed against the reader's clock, so the
          // server's copy and the browser's disagree by whatever time the
          // response spent in flight. The value is deliberately fuzzy and the
          // row re-renders on the next presence event, so the browser wins.
          <span
            className="whitespace-nowrap text-[13px] text-sub"
            suppressHydrationWarning
          >
            {lastSeenLabel(row.original.lastLearningSeenAt, relative) ??
              t('roster.never_seen')}
          </span>
        ),
      },
      {
        id: 'run',
        accessorFn: (row) => row.run?.lifecycle ?? '',
        header: t('roster.column_run'),
        enableSorting: false,
        cell: ({ row }) => {
          const run = row.original.run;
          if (!run) return null;
          return (
            <span className="whitespace-nowrap text-[13px] text-sub">
              {t(`run.${run.lifecycle}`, {
                passed: run.passedCount,
                total: run.sampleCount,
              })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {/*
             * §5.1 — the per-student ledger, from the roster. "Why does 지호
             * have 40 points" is a question a parent asks a teacher, and this
             * is where the teacher goes to answer it. Always offered: unlike
             * the live watch there is no state a student has to be in, and an
             * academy without points answers with its own not-found page.
             */}
            <Link
              className="whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              href={`/studio/academies/${academyId}/points/students/${row.original.membershipId}`}
            >
              {t('roster.open_points')}
            </Link>
            {/*
             * Only for a student actually inside a monitorable exercise: the
             * workspace has nothing to show otherwise, and the server would
             * refuse the watch anyway.
             */}
            {row.original.canOpenLive ? (
              <Link
                className="whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-[13px] font-bold text-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                href={`/studio/academies/${academyId}/teach/classes/${classId}/students/${row.original.membershipId}/live`}
              >
                {t('roster.open_live')}
              </Link>
            ) : null}
          </div>
        ),
      },
    ],
    [academyId, classId, relative, t],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyMessage={emptyMessage}
      // No page size on purpose. Paging would let a student start solving on
      // page two and stay invisible, which is what this page exists to prevent.
      searchPlaceholder={t('roster.search_placeholder')}
      toolbarFilters={filters}
    />
  );
}

/**
 * Last activity as "12 minutes ago" rather than a timestamp: a teacher wants
 * to know how stale a row is, not when it happened.
 */
function lastSeenLabel(
  value: string | null,
  relative: Intl.RelativeTimeFormat,
): string | null {
  if (!value) return null;
  const minutes = Math.round((Date.parse(value) - Date.now()) / 60_000);
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
