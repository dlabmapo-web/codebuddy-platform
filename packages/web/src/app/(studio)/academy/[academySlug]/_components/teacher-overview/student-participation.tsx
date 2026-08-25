'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ParticipationRow } from '@cove/shared';
import { ArrowRight, BarChart3, Inbox } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartCanvas,
  ChartLegend,
  ChartTable,
  ChartTd,
  ChartTh,
  ChartTooltipCard,
  ChartTooltipRow,
  axisProps,
  chartTokens,
  gridProps,
  useReducedMotion,
  type ChartSeries,
} from '@/components/studio/chart';
import { cn } from '@/lib/utils';

import {
  durationDisplay,
  participationWidth,
  shortName,
} from '../../_lib/overview-view';
import { studentAnalyticsPath, type OverviewQuery } from '../../_lib/overview-url';
import { Duration, EmptyState, Panel, Percent } from './overview-primitives';

const CHART_HEIGHT = 300;

/**
 * Student participation: what each student submitted, and what it solved.
 *
 * The grouped bar pair is the point. One bar alone is a volume metric, and
 * volume rewards the student who guesses twenty times; putting the solved count
 * immediately beside it means the pair is read together, and a tall submissions
 * bar with a short solved bar is visibly a student who needs help rather than a
 * student who is working hard.
 *
 * Both series count work created inside the selected period, so a problem
 * solved last term does not reappear here as this week's participation.
 *
 * Names run along the category axis in roster order rather than by volume,
 * because the chart the product team asked for is a comparison and not a
 * ranking — sorting it by height would make it one without changing a word of
 * the copy. When the class is wider than the plot the plot scrolls sideways at
 * a fixed minimum width; §6.5 forbids silently dropping the quiet students,
 * who are exactly the ones this chart exists to make visible.
 *
 * See §6.5 of the teacher overview and student analytics redesign.
 */
export function StudentParticipation({
  academyId,
  isStale,
  query,
  rows,
  truncated,
}: {
  academyId: string;
  isStale: boolean;
  query: OverviewQuery;
  rows: ParticipationRow[];
  truncated: boolean;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teaching');
  const reducedMotion = useReducedMotion();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const series: ChartSeries[] = [
    {
      key: 'submissions',
      label: t('participation.submissions'),
      // The section's own violet: volume is neutral data, not an outcome.
      color: chartTokens.peer,
      symbol: 'square',
    },
    {
      key: 'solvedProblems',
      label: t('participation.solved'),
      // Green is a stated threshold met — here, a problem that passed.
      color: chartTokens.success,
      symbol: 'circle',
    },
  ];

  const hasWork = rows.some(
    (row) => row.submissions > 0 || row.solvedProblems > 0,
  );

  return (
    <Panel
      actions={
        <Link
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-bold text-brand',
            'transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isStale && 'pointer-events-none opacity-50',
          )}
          href={studentAnalyticsPath({
            academySlug,
            query,
            sort: 'submissions',
          })}
        >
          {t('participation.view_all')}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
      description={t('participation.description')}
      icon={BarChart3}
      id="student-participation"
      meta={t('participation.meta', { count: rows.length })}
      testId="student-participation"
      title={t('participation.title')}
      tone="peer"
    >
      <div className="p-4">
        {!hasWork ? (
          <EmptyState
            body={t('participation.empty_body')}
            icon={Inbox}
            title={t('participation.empty_title')}
            tone="peer"
          />
        ) : (
          <>
            <ChartLegend
              hidden={hidden}
              onToggle={(key) =>
                setHidden((current) => {
                  const next = new Set(current);
                  // Never both: a legend that can empty the plot is a control
                  // that can make the section say nothing by accident.
                  if (next.has(key)) next.delete(key);
                  else if (next.size < series.length - 1) next.add(key);
                  return next;
                })
              }
              series={series}
            />

            {/*
             * The scroller is the element with the overflow, and the plot
             * inside it has the minimum width. Putting the width on the
             * scroller instead would make the page itself scroll sideways.
             */}
            <div className="mt-3 overflow-x-auto">
              <div style={{ minWidth: participationWidth(rows.length) }}>
                <ChartCanvas height={CHART_HEIGHT} label={t('participation.chart_label')}>
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart
                      barGap={2}
                      data={rows}
                      margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                    >
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        {...axisProps}
                        dataKey="displayName"
                        interval={0}
                        tickFormatter={(name: string) => shortName(name)}
                      />
                      <YAxis {...axisProps} allowDecimals={false} width={36} />
                      <Tooltip
                        content={<ParticipationTooltip />}
                        cursor={{ fill: chartTokens.peerSoft, opacity: 0.6 }}
                      />
                      {series
                        .filter((entry) => !hidden.has(entry.key))
                        .map((entry) => (
                          <Bar
                            dataKey={entry.key}
                            fill={entry.color}
                            isAnimationActive={!reducedMotion}
                            key={entry.key}
                            name={entry.label}
                            radius={[3, 3, 0, 0]}
                          />
                        ))}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCanvas>
              </div>
            </div>

            {truncated ? (
              <p className="mt-2 text-[12px] text-warning">
                {t('participation.truncated')}
              </p>
            ) : null}

            <ChartTable
              caption={t('participation.table_caption')}
              head={
                <>
                  <ChartTh>{t('participation.column_student')}</ChartTh>
                  <ChartTh numeric>{t('participation.submissions')}</ChartTh>
                  <ChartTh numeric>{t('participation.solved')}</ChartTh>
                  <ChartTh numeric>{t('participation.column_time')}</ChartTh>
                  <ChartTh numeric>{t('participation.column_score')}</ChartTh>
                </>
              }
              summary={t('participation.table_summary', { count: rows.length })}
            >
              {rows.map((row) => (
                <tr key={row.membershipId}>
                  <ChartTd>
                    {row.displayName}
                    {row.className ? (
                      <span className="ml-1.5 text-[11px] text-sub">
                        {row.className}
                      </span>
                    ) : null}
                  </ChartTd>
                  <ChartTd numeric>{row.submissions}</ChartTd>
                  <ChartTd numeric>{row.solvedProblems}</ChartTd>
                  <ChartTd numeric>
                    <Duration seconds={row.activeSeconds} />
                  </ChartTd>
                  <ChartTd numeric>
                    <Percent value={row.averageScore} />
                  </ChartTd>
                </tr>
              ))}
            </ChartTable>
          </>
        )}
      </div>
    </Panel>
  );
}

/**
 * The four measurements §6.5 asks the tooltip to carry.
 *
 * Time and score ride along with the two plotted series rather than being
 * fetched on hover: the pair of bars is the question "did the effort land", and
 * the two numbers that answer it must describe the same moment as the bars.
 */
function ParticipationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ParticipationRow }[];
}) {
  const { t } = useTranslation('teaching');
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const time = durationDisplay(row.activeSeconds);

  return (
    <ChartTooltipCard subtitle={row.className ?? undefined} title={row.displayName}>
      <ChartTooltipRow
        label={t('participation.submissions')}
        value={row.submissions}
      />
      <ChartTooltipRow
        label={t('participation.solved')}
        value={row.solvedProblems}
      />
      <ChartTooltipRow
        label={t('participation.column_time')}
        value={
          time.kind === 'none'
            ? '—'
            : time.kind === 'hours'
              ? t('duration.hours', { hours: time.hours, minutes: time.minutes })
              : t('duration.minutes', { minutes: time.minutes })
        }
      />
      <ChartTooltipRow
        label={t('participation.column_score')}
        value={
          row.averageScore === null
            ? '—'
            : t('percent', { value: row.averageScore })
        }
      />
    </ChartTooltipCard>
  );
}
