'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ActiveTimePreviewRow, ScorePreviewRow } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Target, TimerReset, Trophy, Zap } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { cn } from '@/lib/utils';

import { studentAnalyticsPath, type OverviewQuery } from '../../_lib/overview-url';
import { Avatar, Duration, EmptyState, Panel } from './overview-primitives';

/**
 * The two five-row previews, and the one rule they share.
 *
 * `Order` here is a position in *this* list under *these* filters, not a rank a
 * child holds. It is set in the same grey as the other supporting figures
 * rather than being emphasised, because the column a teacher should read is the
 * measurement beside it — the position is only there so the row can be talked
 * about ("the third one down") without naming the student out loud.
 *
 * Neither section is stored, exported, or reachable from anything a student
 * can call. §6.6 permits teacher-private contextual ordering and §4 forbids a
 * leaderboard, and the difference between the two is entirely that this one is
 * recomputed from the filter bar every time it is looked at.
 *
 * See §6.6 and §6.7 of the teacher overview and student analytics redesign.
 */

export function ScoreOrderPreview({
  academyId,
  isStale,
  query,
  rows,
}: {
  academyId: string;
  isStale: boolean;
  query: OverviewQuery;
  rows: ScorePreviewRow[];
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('teaching');
  const columns: ColumnDef<ScorePreviewRow, unknown>[] = [
    {
      id: 'order',
      header: t('order'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="font-mono text-[12px] tabular-nums text-sub">
          {row.index + 1}
        </span>
      ),
    },
    {
      accessorKey: 'displayName',
      header: t('scores.column_student'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <Avatar
            id={row.original.membershipId}
            name={row.original.displayName}
            size="sm"
          />
          <span className="font-semibold">{row.original.displayName}</span>
        </span>
      ),
    },
    {
      accessorKey: 'className',
      header: t('scores.column_class'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="text-[12px] text-sub">
          {row.original.className ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'averageScore',
      header: () => <NumericHeader>{t('scores.column_score')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell>
          {row.original.averageScore === null ? (
            <span className="text-sub" title={t('no_data')}>
              <span aria-hidden>—</span>
              <span className="sr-only">{t('no_data')}</span>
            </span>
          ) : (
            <span className="font-bold">
              {t('percent', { value: row.original.averageScore })}
            </span>
          )}
        </NumericCell>
      ),
    },
    {
      accessorKey: 'attemptedProblems',
      header: () => <NumericHeader>{t('scores.column_attempted')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell className="text-sub">
          {row.original.attemptedProblems}
        </NumericCell>
      ),
    },
    {
      accessorKey: 'lastActivityAt',
      header: () => <NumericHeader>{t('scores.column_last')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell className="text-[12px] text-sub">
          <LastSeen at={row.original.lastActivityAt} locale={i18n.language} />
        </NumericCell>
      ),
    },
  ];

  return (
    <Panel
      actions={
        <PreviewLink
          disabled={isStale}
          href={studentAnalyticsPath({ academySlug, query, sort: 'score' })}
          label={t('scores.view_all')}
        />
      }
      description={t('scores.description')}
      icon={Target}
      id="score-order"
      testId="score-order"
      title={t('scores.title')}
      tone="success"
    >
      {rows.length === 0 ? (
        <EmptyState
          body={t('scores.empty_body')}
          icon={Trophy}
          title={t('scores.empty_title')}
          tone="success"
        />
      ) : (
        <OverviewDataTable columns={columns} data={rows} />
      )}
    </Panel>
  );
}

export function ActiveLearningPreview({
  academyId,
  isStale,
  leastActive,
  mostActive,
  query,
}: {
  academyId: string;
  isStale: boolean;
  leastActive: ActiveTimePreviewRow[];
  mostActive: ActiveTimePreviewRow[];
  query: OverviewQuery;
}) {
  const academySlug = useAcademySlug();
  const { t, i18n } = useTranslation('teaching');
  // Both ends arrive in one response, so the toggle is a lens over data already
  // in hand: switching it must not refetch, and must not be able to disagree
  // with the list it just replaced.
  const [end, setEnd] = React.useState<'most' | 'least'>('most');
  const rows = end === 'most' ? mostActive : leastActive;
  const columns: ColumnDef<ActiveTimePreviewRow, unknown>[] = [
    {
      id: 'order',
      header: t('order'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="font-mono text-[12px] tabular-nums text-sub">
          {row.index + 1}
        </span>
      ),
    },
    {
      accessorKey: 'displayName',
      header: t('scores.column_student'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-2.5">
          <Avatar
            id={row.original.membershipId}
            name={row.original.displayName}
            size="sm"
          />
          <span className="font-semibold">{row.original.displayName}</span>
        </span>
      ),
    },
    {
      accessorKey: 'className',
      header: t('scores.column_class'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="text-[12px] text-sub">
          {row.original.className ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'activeSeconds',
      header: () => <NumericHeader>{t('activity.column_time')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell>
          <Duration className="font-bold" seconds={row.original.activeSeconds} />
        </NumericCell>
      ),
    },
    {
      accessorKey: 'activeDays',
      header: () => <NumericHeader>{t('activity.column_days')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell className="text-sub">{row.original.activeDays}</NumericCell>
      ),
    },
    {
      accessorKey: 'lastActivityAt',
      header: () => <NumericHeader>{t('scores.column_last')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell className="text-[12px] text-sub">
          <LastSeen at={row.original.lastActivityAt} locale={i18n.language} />
        </NumericCell>
      ),
    },
  ];

  return (
    <Panel
      actions={
        <div className="flex items-center gap-2">
          <fieldset className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            <legend className="sr-only">{t('activity.end_label')}</legend>
            {(['most', 'least'] as const).map((option) => (
              <button
                aria-pressed={end === option}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[12px] font-bold transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  end === option
                    ? 'bg-brand text-on-brand'
                    : 'text-sub hover:text-ink',
                )}
                key={option}
                onClick={() => setEnd(option)}
                type="button"
              >
                {t(`activity.end_${option}`)}
              </button>
            ))}
          </fieldset>
          <PreviewLink
            disabled={isStale}
            href={studentAnalyticsPath({
              academySlug,
              query,
              sort: 'activeTime',
              // §6.7 — the choice on screen is what the link opens, so "least
              // active" never lands on a page showing the most active.
              direction: end === 'most' ? 'desc' : 'asc',
            })}
            label={t('activity.view_all')}
          />
        </div>
      }
      description={t('activity.description')}
      icon={TimerReset}
      id="active-learning"
      testId="active-learning"
      title={t('activity.title')}
      tone="teal"
    >
      {rows.length === 0 ? (
        <EmptyState
          body={t('activity.empty_body')}
          icon={Zap}
          title={t('activity.empty_title')}
          tone="teal"
        />
      ) : (
        <OverviewDataTable columns={columns} data={rows} />
      )}
    </Panel>
  );
}

function OverviewDataTable<TData>({
  columns,
  data,
}: {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
}) {
  return (
    <DataTable
      className="[&_table]:min-w-[680px] [&_tbody_tr]:h-14"
      columns={columns}
      data={data}
      frameless
      showColumnVisibility={false}
    />
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
        'block text-right font-mono tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}

function PreviewLink({
  disabled,
  href,
  label,
}: {
  disabled: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-bold text-brand',
        'transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        disabled && 'pointer-events-none opacity-50',
      )}
      href={href}
    >
      {label}
      <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

function LastSeen({ at, locale }: { at: string | null; locale: string }) {
  const { t } = useTranslation('teaching');
  if (!at) return <span>{t('never')}</span>;
  return (
    <time dateTime={at}>
      {new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
      }).format(new Date(at))}
    </time>
  );
}
