'use client';

import type { RecentJoin, StudentGrowth } from '@cove/shared';
import { Sprout, TrendingDown, TrendingUp, Minus, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  axisLabelStride,
  growthBarHeight,
  growthTrend,
  roleTones,
} from '../../_lib/manager-view';
import { formatLocalDate } from '../../_lib/overview-view';
import { ProfileAvatar } from '@/components/studio/profile-avatar';

import { EmptyState, Panel, toneStyles } from '../overview-ui/panel';

/**
 * Arrivals, by the academy's own calendar days.
 *
 * The chart draws every day in the period, including the ones nobody joined.
 * Deriving the axis from the days that have rows would silently close the gaps
 * and turn a quiet fortnight into a busy one — the single most common way a
 * growth chart lies without anybody writing a lie.
 *
 * §16 — the chart has an equivalent table and a text summary. Both are here
 * rather than one being an alternative for assistive technology: the table is
 * collapsed by default and available to everyone, because "which day was that
 * spike" is a question a sighted manager asks too and a chart cannot answer.
 *
 * Green is this section's hue and only this section's. It means growth, which
 * is why no role and no status on this page is allowed to be green — a green
 * badge beside a person would read as a verdict on them.
 */
export function GrowthPanel({
  growth,
  isStale,
  periodDays,
  recentJoins,
}: {
  growth: StudentGrowth;
  isStale: boolean;
  periodDays: number | null;
  recentJoins: RecentJoin[];
}) {
  const { t, i18n } = useTranslation('manager');
  const peak = Math.max(...growth.days.map((day) => day.joined), 0);
  const stride = axisLabelStride(growth.days.length);
  const trend = growthTrend(growth.changePercent);
  const TrendIcon =
    trend.key === 'up' ? TrendingUp : trend.key === 'down' ? TrendingDown : Minus;

  return (
    <Panel
      description={t('growth.description')}
      icon={Sprout}
      id="manager-growth"
      meta={t('growth.meta', { count: growth.joined })}
      testId="manager-growth"
      title={t('growth.title')}
      tone="success"
    >
      {growth.joined === 0 && recentJoins.length === 0 ? (
        <EmptyState
          body={t('growth.empty_body')}
          icon={UserPlus}
          title={t('growth.empty_title')}
          tone="success"
        />
      ) : (
        <div className="grid gap-px bg-border lg:grid-cols-[1.6fr_1fr]">
          <div className="bg-card p-4">
            {/* The summary sentence comes before the chart, not after it. It is
                the whole finding; the bars are the evidence. */}
            <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="font-mono text-[32px] font-extrabold leading-none tabular-nums text-success">
                {growth.joined}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                  trend.key === 'up'
                    ? 'bg-success/10 text-success'
                    : trend.key === 'down'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-accent text-sub',
                )}
              >
                <TrendIcon aria-hidden className="size-3.5" strokeWidth={2.5} />
                {trend.key === 'no_baseline'
                  ? t('growth.no_baseline')
                  : t(`growth.${trend.key}`, { value: trend.value })}
              </span>
              {growth.previousJoined !== null ? (
                <span className="text-[11.5px] text-sub">
                  {t('growth.previous', { count: growth.previousJoined })}
                </span>
              ) : null}
            </p>

            {/*
             * The plot. Bars rather than a line: joins are countable events on
             * discrete days, and a line between them would draw a continuous
             * rate that nobody measured.
             */}
            <div
              aria-hidden
              className="mt-4 flex h-28 items-end gap-[3px]"
            >
              {growth.days.map((day) => (
                <span
                  className="group relative flex h-full flex-1 items-end"
                  key={day.date}
                  title={t('growth.day', {
                    date: formatLocalDate(day.date, i18n.language),
                    count: day.joined,
                  })}
                >
                  <span
                    className={cn(
                      'w-full rounded-t-[3px] transition-[height] duration-500 motion-reduce:transition-none',
                      day.joined > 0 ? 'bg-success' : 'bg-accent',
                    )}
                    style={{
                      height:
                        day.joined > 0 ? growthBarHeight(day.joined, peak) : '3px',
                    }}
                  />
                </span>
              ))}
            </div>

            <div aria-hidden className="mt-1.5 flex gap-[3px]">
              {growth.days.map((day, index) => (
                <span
                  className="flex-1 truncate text-center font-mono text-[9.5px] font-semibold text-sub"
                  key={day.date}
                >
                  {index % stride === 0 || index === growth.days.length - 1
                    ? formatLocalDate(day.date, i18n.language, { day: 'numeric' })
                    : ''}
                </span>
              ))}
            </div>

            {/* §16 — the chart's equivalent table, for everyone. */}
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-bold text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {t('growth.chart_label')}
              </summary>
              <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-[12px]">
                  <caption className="sr-only">
                    {t('growth.chart_label')}
                  </caption>
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-bold" scope="col">
                        {t('growth.table_date')}
                      </th>
                      <th className="px-3 py-1.5 text-right font-bold" scope="col">
                        {t('growth.table_joined')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {growth.days.map((day) => (
                      <tr key={day.date}>
                        <td className="px-3 py-1.5 font-mono tabular-nums">
                          {formatLocalDate(day.date, i18n.language)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums">
                          {day.joined}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {periodDays !== null ? (
              <p className="mt-2 text-[11px] text-sub">
                {t('scope.compare', { count: periodDays })}
              </p>
            ) : null}
          </div>

          {/* ------------------------------------------------ recent joins */}

          <div className="bg-card p-4">
            <h3 className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-sub">
              {t('growth.recent_title')}
            </h3>
            {recentJoins.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-sub">
                {t('growth.recent_empty')}
              </p>
            ) : (
              <ul className={cn('mt-3 flex flex-col gap-3', isStale && 'opacity-60')}>
                {recentJoins.map((join) => (
                  <li className="flex items-center gap-2.5" key={join.membershipId}>
                    <ProfileAvatar
                      academyImageUrl={join.academyImageUrl}
                      externalAvatarUrl={join.externalAvatarUrl}
                      globalImageUrl={join.globalImageUrl}
                      name={join.displayName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold">
                        {join.displayName}
                      </span>
                      <span className="block font-mono text-[10.5px] tabular-nums text-sub">
                        {new Intl.DateTimeFormat(i18n.language, {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(join.joinedAt))}
                      </span>
                    </span>
                    {/* The role's own hue, the same one it wears in the
                        composition band above. One person, one colour, in every
                        list they appear in. */}
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold',
                        toneStyles[roleTones[join.role]].chip,
                      )}
                    >
                      {t(`role.${join.role}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
