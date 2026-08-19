'use client';

import type { StudentActivityPoint, StudentOverviewScope } from '@cove/shared';
import { CalendarClock, CloudOff } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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

import { formatLocalDate } from '../../_lib/overview-view';
import { Duration, EmptyState, Panel } from './student-primitives';

const CHART_HEIGHT = 220;

/**
 * When the student worked, and what came out of it.
 *
 * Minutes are the bars and solved problems are the line, because the two
 * answer different questions and a child should be able to see them disagree.
 * A long teal bar under a flat line is an afternoon that was hard; a short bar
 * under a rising line is one that went well. Neither is a verdict, and neither
 * is labelled as one.
 *
 * Every day in the period gets a bar, including the empty ones. A chart that
 * drew only the days a student worked would space a quiet fortnight exactly
 * like a busy one, and the shape of a month is most of what this section says.
 *
 * The sentence under the title is not decoration either. Counted time is the
 * one measurement on this page a child could misread as attendance, so the
 * section says what it is in words before it draws anything.
 *
 * See §7.6 of the student academy overview design.
 */
export function ActivityChart({
  activity,
  scope,
}: {
  activity: { bucket: 'day' | 'week'; points: StudentActivityPoint[] };
  scope: StudentOverviewScope;
}) {
  const { t, i18n } = useTranslation('learning');
  const reducedMotion = useReducedMotion();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const series: ChartSeries[] = [
    {
      key: 'minutes',
      label: t('activity.minutes'),
      // The page's colour for measured time, on the page's time chart.
      color: chartTokens.teal,
      symbol: 'square',
    },
    {
      key: 'solved',
      label: t('activity.solved'),
      color: chartTokens.success,
      symbol: 'circle',
    },
  ];

  const rows = React.useMemo(
    () =>
      activity.points.map((point) => ({
        ...point,
        minutes: Math.round(point.activeSeconds / 60),
      })),
    [activity.points],
  );

  const hasWork = rows.some(
    (row) => row.activeSeconds > 0 || row.submissions > 0,
  );

  const formatDay = (date: string) => formatLocalDate(date, i18n.language);

  return (
    <Panel
      description={t(`activity.description_${activity.bucket}`)}
      icon={CalendarClock}
      id="activity"
      meta={
        scope.activityTrackedSince
          ? t('activity.tracked_since', {
              date: formatDay(scope.activityTrackedSince),
            })
          : undefined
      }
      testId="activity-chart"
      title={t('activity.title')}
      tone="teal"
    >
      <div className="p-4">
        <p className="mb-3 text-[12px] leading-[1.55] text-sub">
          {t('activity.meaning')}
        </p>

        {!hasWork ? (
          <EmptyState
            body={t('activity.empty_body')}
            icon={CloudOff}
            title={t('activity.empty_title')}
            tone="teal"
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

            <div className="mt-3">
              <ChartCanvas height={CHART_HEIGHT} label={t('activity.chart_label')}>
                <ResponsiveContainer height="100%" width="100%">
                  <ComposedChart
                    data={rows}
                    margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid {...gridProps} />
                    <XAxis
                      {...axisProps}
                      dataKey="date"
                      interval="preserveStartEnd"
                      minTickGap={16}
                      tickFormatter={formatDay}
                    />
                    <YAxis {...axisProps} allowDecimals={false} width={32} />
                    <Tooltip
                      content={
                        <ActivityTooltip
                          bucket={activity.bucket}
                          formatDay={formatDay}
                        />
                      }
                      cursor={{ fill: chartTokens.tealSoft, opacity: 0.6 }}
                    />
                    {!hidden.has('minutes') ? (
                      <Bar
                        dataKey="minutes"
                        fill={chartTokens.teal}
                        isAnimationActive={!reducedMotion}
                        name={t('activity.minutes')}
                        radius={[3, 3, 0, 0]}
                      />
                    ) : null}
                    {!hidden.has('solved') ? (
                      <Line
                        dataKey="solved"
                        dot={false}
                        isAnimationActive={!reducedMotion}
                        name={t('activity.solved')}
                        stroke={chartTokens.success}
                        strokeWidth={2}
                        type="monotone"
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCanvas>
            </div>

            <ChartTable
              caption={t('activity.table_caption')}
              head={
                <>
                  <ChartTh>{t('activity.column_date')}</ChartTh>
                  <ChartTh numeric>{t('activity.column_time')}</ChartTh>
                  <ChartTh numeric>{t('activity.column_submissions')}</ChartTh>
                  <ChartTh numeric>{t('activity.solved')}</ChartTh>
                </>
              }
              summary={t('activity.table_summary', { count: rows.length })}
            >
              {rows.map((row) => (
                <tr key={row.date}>
                  <ChartTd>{formatDay(row.date)}</ChartTd>
                  <ChartTd numeric>
                    <Duration seconds={row.activeSeconds} />
                  </ChartTd>
                  <ChartTd numeric>{row.submissions}</ChartTd>
                  <ChartTd numeric>{row.solved}</ChartTd>
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
 * The tooltip, with a formatter Recharts cannot shadow.
 *
 * The prop is `formatDay` rather than `label` on purpose. Recharts injects its
 * own `active`, `payload`, and `label` into whatever it is given as `content`,
 * and its `label` is the category value — so a prop of that name is silently
 * replaced by a string at render time, and calling it throws. Naming the
 * formatter something Recharts does not own is what keeps the two apart.
 */
function ActivityTooltip({
  active,
  bucket,
  formatDay,
  payload,
}: {
  active?: boolean;
  bucket: 'day' | 'week';
  formatDay: (date: string) => string;
  payload?: { payload: StudentActivityPoint & { minutes: number } }[];
}) {
  const { t } = useTranslation('learning');
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  return (
    <ChartTooltipCard
      title={
        bucket === 'week'
          ? t('activity.week_of', { date: formatDay(row.date) })
          : formatDay(row.date)
      }
    >
      <ChartTooltipRow
        label={t('activity.minutes')}
        value={<Duration seconds={row.activeSeconds} />}
      />
      <ChartTooltipRow
        label={t('activity.column_submissions')}
        value={row.submissions}
      />
      <ChartTooltipRow label={t('activity.solved')} value={row.solved} />
    </ChartTooltipCard>
  );
}
