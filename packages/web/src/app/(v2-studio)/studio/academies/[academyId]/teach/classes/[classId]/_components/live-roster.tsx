'use client';

import type { MonitoringClassRoster } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import {
  countRoster,
  filterRoster,
  mergeRoster,
  sortRoster,
  type RosterFilter,
} from '@/lib/monitoring/roster';
import { cn } from '@/lib/utils';

import { ConnectionBadge, LiveStateBadge } from '../../../_components/live-badges';

const filters: RosterFilter[] = ['all', 'online', 'solving', 'idle', 'offline'];

/**
 * One class's students, live.
 *
 * Two sources, kept apart: enrollment comes from the query and decides who is
 * on the list, presence comes from the class room and decides how each row
 * reads. A realtime outage therefore leaves a complete roster of offline-
 * looking rows *and* a banner saying live updates are unavailable — never a
 * silently empty class.
 */
export function LiveRoster({
  academyId,
  initialRoster,
}: {
  academyId: string;
  initialRoster: MonitoringClassRoster;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const classId = initialRoster.class.classId;
  const [filter, setFilter] = React.useState<RosterFilter>('all');
  const [search, setSearch] = React.useState('');

  const rosterQuery = useQuery({
    queryKey: ['academy', academyId, 'teaching-roster', classId],
    queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }),
    initialData: initialRoster,
    retry: false,
  });
  const roster = rosterQuery.data;
  const { entries, state, denied } = useClassPresence({ academyId, classId });

  const rows = React.useMemo(
    () => sortRoster(mergeRoster(roster.students, entries)),
    [entries, roster.students],
  );
  const counts = React.useMemo(() => countRoster(rows), [rows]);
  const visible = React.useMemo(
    () => filterRoster(rows, { filter, search }),
    [filter, rows, search],
  );

  const relative = React.useMemo(
    () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
    [locale],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-sub hover:text-ink"
          href={`/studio/academies/${academyId}/teach/classes`}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('roster.back')}
        </Link>
        <ConnectionBadge state={denied === 'MONITORING_ACCESS_DENIED' ? 'revoked' : state} />
      </div>

      {denied === 'MONITORING_ACCESS_DENIED' ? (
        <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          {t('connection.revoked_body')}
        </p>
      ) : null}
      {state === 'degraded' ? (
        <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          {t('connection.degraded_body')}
        </p>
      ) : null}

      <dl className="grid grid-cols-3 gap-3">
        <SummaryCard label={t('roster.summary_total')} value={counts.total} />
        <SummaryCard label={t('roster.summary_online')} value={counts.online} />
        <SummaryCard label={t('roster.summary_solving')} value={counts.solving} />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-label={t('roster.filter_all')}
          className="flex flex-wrap gap-1.5"
          role="group"
        >
          {filters.map((option) => (
            <button
              aria-pressed={filter === option}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                filter === option
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border text-sub hover:text-ink',
              )}
              key={option}
              onClick={() => setFilter(option)}
              type="button"
            >
              {t(`roster.filter_${option}`)}
            </button>
          ))}
        </div>

        <label className="ml-auto flex min-w-[220px] flex-1 flex-col gap-1 sm:max-w-xs">
          <span className="sr-only">{t('roster.search_label')}</span>
          <input
            className="h-9 rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('roster.search_placeholder')}
            type="search"
            value={search}
          />
        </label>
      </div>

      {roster.truncated ? (
        <p className="text-[13px] font-semibold text-draft">
          {t('roster.truncated', { count: roster.students.length })}
        </p>
      ) : null}

      {roster.students.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-5 text-[14px] text-sub">
          {t('roster.no_enrollments')}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-5 text-[14px] text-sub">
          {t('roster.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {visible.map((row) => (
            <li
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              key={row.membershipId}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold">
                  {row.displayName ?? row.email ?? row.membershipId}
                </p>
                <p className="truncate text-[13px] text-sub">
                  {row.active ? row.email : t('roster.membership_inactive')}
                </p>
              </div>

              <LiveStateBadge state={row.state} />

              <p className="min-w-[140px] text-[13px] text-sub">
                {row.materialId ? t('roster.in_exercise') : t('roster.no_exercise')}
              </p>

              {/* "9 minutes ago" is computed against the reader's clock, so
                  the server's copy and the browser's disagree by whatever time
                  the response spent in flight. The value is deliberately fuzzy
                  and the row re-renders on the next presence event, so the
                  browser's answer simply wins. */}
              <p className="min-w-[110px] text-[13px] text-sub" suppressHydrationWarning>
                {lastSeenLabel(row.lastLearningSeenAt, relative) ??
                  t('roster.never_seen')}
              </p>

              <p className="min-w-[120px] text-[13px] text-sub">
                {row.run
                  ? t(`run.${row.run.lifecycle}`, {
                      passed: row.run.passedCount,
                      total: row.run.sampleCount,
                    })
                  : null}
              </p>

              {/* Only for a student actually inside a monitorable exercise:
                  the workspace has nothing to show otherwise, and the server
                  would refuse the watch anyway. */}
              {row.canOpenLive ? (
                <Link
                  className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  href={`/studio/academies/${academyId}/teach/classes/${classId}/students/${row.membershipId}/live`}
                >
                  {t('roster.open_live')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <dt className="text-[12.5px] font-semibold text-sub">{label}</dt>
      <dd className="mt-0.5 text-[1.4rem] font-extrabold leading-tight">
        {value}
      </dd>
    </div>
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
