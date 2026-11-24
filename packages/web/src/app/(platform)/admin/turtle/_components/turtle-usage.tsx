'use client';

import { academyLocalDate, type TurtleUsageAcademy, type TurtleUsageInput, type TurtleUsageResult } from '@cove/shared';
import { formatDateTime, formatNumber, formatShortDate, formatTime } from '@cove/i18n/format';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, BarChart3, DoorOpen, MonitorSmartphone, Play, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Panel, toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import {
  ChartCanvas, ChartLegend, ChartTable, ChartTd, ChartTh, ChartTooltipCard, ChartTooltipRow,
  axisProps, chartTokens, gridProps, useReducedMotion, type ChartSeries,
} from '@/components/studio/chart';
import { DataTable } from '@/components/studio/data-table';
import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { customTurtleRange, parseTurtleQuery, turtleInput, turtlePath, turtlePeriods, type TurtleQuery } from '../../_lib/turtle-query';

const REFRESH_MS = 30_000;

export function TurtleUsage({ initialData, initialInput }: { initialData: TurtleUsageResult; initialInput: TurtleUsageInput }) {
  const { t } = useTranslation('platform-turtle');
  const locale = useLocale();
  const search = useSearchParams().toString();
  const query = React.useMemo(() => parseTurtleQuery(search), [search]);
  const change = (next: TurtleQuery) => window.history.replaceState(null, '', turtlePath(next));

  const input = turtleInput(query);
  const today = academyLocalDate(new Date());
  const result = useQuery({
    queryKey: ['platform-turtle', input],
    queryFn: () => orpc.platformTurtle.usage(input),
    initialData: JSON.stringify(input) === JSON.stringify(initialInput) ? initialData : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    // Only a range still being counted can change. Hidden tabs do not poll.
    refetchInterval: input.to >= today ? REFRESH_MS : false,
    retry: false,
  });
  const data = result.data ?? initialData;
  const selected = data.academies.find((academy) => academy.academyId === query.academyId);
  const scope = query.academyId ? (selected ? [selected] : []) : data.academies;
  const sum = (key: 'activeNow' | 'devices' | 'entries' | 'runs') =>
    formatNumber(scope.reduce((total, academy) => total + academy[key], 0), locale);
  const pick = (from: string, to: string, changed: 'from' | 'to') => {
    const range = customTurtleRange(from, to, changed);
    if (range) change({ period: 'custom', ...range, academyId: query.academyId });
  };

  const columns = React.useMemo<ColumnDef<TurtleUsageAcademy>[]>(() => {
    const number = (key: 'activeNow' | 'devices' | 'entries' | 'runs', header: string): ColumnDef<TurtleUsageAcademy> => ({
      id: key, accessorFn: (row) => row[key], header, size: 104, meta: { align: 'right' },
      cell: ({ row }) => (
        <span className={cn('font-mono text-[14px] font-bold tabular-nums', row.original[key] ? (key === 'activeNow' ? 'text-success' : 'text-ink') : 'text-sub')}>
          {formatNumber(row.original[key], locale)}
        </span>
      ),
    });
    return [
      {
        id: 'academy', accessorFn: (row) => `${row.name} ${row.slug}`, header: t('table.academy'), enableHiding: false,
        cell: ({ row }) => (
          <button
            aria-pressed={row.original.academyId === query.academyId}
            className="block max-w-full rounded-md text-left hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={(event) => {
              event.stopPropagation();
              change({ ...query, academyId: row.original.academyId === query.academyId ? undefined : row.original.academyId });
            }}
            type="button"
          >
            <span className="block truncate text-[14px] font-bold">{row.original.name}</span>
            <span className="block truncate font-mono text-[12px] text-sub">/{row.original.slug}</span>
          </button>
        ),
      },
      number('activeNow', t('active_now')),
      number('devices', t('devices')),
      number('entries', t('entries')),
      number('runs', t('runs')),
      {
        id: 'lastUsed', accessorFn: (row) => row.lastUsedAt ?? '', header: t('table.last_used'), size: 172,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13px] text-sub">
            {row.original.lastUsedAt ? formatDateTime(row.original.lastUsedAt, locale) : t('table.never')}
          </span>
        ),
      },
    ];
  }, [locale, query, t]);

  const tiles = [
    { key: 'activeNow', icon: Activity, tone: 'success', label: t('active_now'), hint: t('active_now_hint') },
    { key: 'devices', icon: MonitorSmartphone, tone: 'primary', label: t('devices'), hint: t('devices_hint') },
    { key: 'entries', icon: DoorOpen, tone: 'teal', label: t('entries'), hint: t('entries_hint') },
    { key: 'runs', icon: Play, tone: 'brand', label: t('runs'), hint: t('runs_hint') },
  ] as const;

  return (
    <div className="grid gap-5" data-testid="turtle-usage">
      <div className="flex flex-wrap items-center gap-2">
        <div aria-label={t('period.label')} className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1" role="group">
          {turtlePeriods.map((period) => (
            <button
              aria-pressed={query.period === period}
              className={cn('rounded-md px-3 py-1.5 text-[13px] font-bold transition-colors', query.period === period ? 'bg-brand-soft text-brand' : 'text-sub hover:text-ink')}
              key={period}
              onClick={() => change({ period, academyId: query.academyId })}
              type="button"
            >
              {t(`period.${period}`)}
            </button>
          ))}
        </div>
        {(['from', 'to'] as const).map((end) => (
          <label className="flex items-center gap-1.5 text-[13px] font-semibold text-sub" key={end}>
            {t(`period.${end}`)}
            <input
              className="h-9 rounded-lg border border-border bg-card px-2 text-[13px] text-ink"
              max={today}
              onChange={(event) => end === 'from' ? pick(event.target.value, input.to, 'from') : pick(input.from, event.target.value, 'to')}
              type="date"
              value={input[end]}
            />
          </label>
        ))}
        {query.academyId ? (
          <button
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] font-bold text-ink hover:border-brand"
            onClick={() => change({ ...query, academyId: undefined })}
            type="button"
          >
            {selected?.name ?? t('table.unknown')}
            <X aria-hidden className="size-3.5" />
            <span className="sr-only">{t('show_all')}</span>
          </button>
        ) : null}
        <p className="ml-auto text-[12.5px] text-sub" role="status">
          {result.isError ? <span className="font-bold text-danger">{t('refresh_failed')}</span> : t('updated', { time: formatTime(data.asOf, locale, true) })}
        </p>
      </div>

      <ul className={cn('grid gap-2 sm:grid-cols-2 xl:grid-cols-4', result.isPlaceholderData && 'opacity-60')}>
        {tiles.map((tile) => (
          <li className="rounded-xl border border-border bg-card px-4 py-3.5" key={tile.key}>
            <div className="flex items-center gap-3">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', toneStyles[tile.tone].chip)}>
                <tile.icon aria-hidden className="size-[1.15rem]" strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[22px] font-extrabold leading-none tabular-nums text-ink">{sum(tile.key)}</span>
                <span className="mt-1 block truncate text-[12px] font-bold text-sub">{tile.label}</span>
              </span>
            </div>
            <p className="mt-3 text-[12.5px] font-semibold text-sub">{tile.hint}</p>
          </li>
        ))}
      </ul>

      <UsageChart data={data} />

      <DataTable
        columns={columns}
        data={data.academies}
        emptyMessage={t('table.empty')}
        pageSize={20}
        rowClassName={(row) => (row.academyId === query.academyId ? 'bg-brand-soft/50' : undefined)}
        searchPlaceholder={t('table.search')}
      />
      <p className="text-[12.5px] leading-[1.6] text-sub">{t('note')}</p>
    </div>
  );
}

function UsageChart({ data }: { data: TurtleUsageResult }) {
  const { t } = useTranslation('platform-turtle');
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const label = (at: string) => (data.unit === 'hour' ? formatTime(at, locale) : formatShortDate(at, locale));
  const series: ChartSeries[] = [
    { key: 'runs', label: t('runs'), color: chartTokens.teal, symbol: 'square' },
    { key: 'devices', label: t('devices'), color: chartTokens.brand, symbol: 'circle' },
  ];
  const used = data.series.some((row) => row.devices > 0);

  return (
    <Panel icon={BarChart3} id="turtle-chart" title={t(`chart.title_${data.unit}`)} tone="teal">
      <div className="p-4">
        {used ? (
          <>
            <ChartLegend series={series} />
            <div className="mt-3">
              <ChartCanvas height={220} label={t(`chart.title_${data.unit}`)}>
                <ResponsiveContainer height="100%" width="100%">
                  <ComposedChart data={data.series} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis {...axisProps} dataKey="at" interval="preserveStartEnd" minTickGap={16} tickFormatter={label} />
                    <YAxis {...axisProps} allowDecimals={false} width={40} />
                    <Tooltip content={<UsageTooltip formatAt={label} />} cursor={{ fill: chartTokens.tealSoft, opacity: 0.6 }} />
                    <Bar dataKey="runs" fill={chartTokens.teal} isAnimationActive={!reducedMotion} radius={[3, 3, 0, 0]} />
                    <Line dataKey="devices" dot={false} isAnimationActive={!reducedMotion} stroke={chartTokens.brand} strokeWidth={2} type="monotone" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCanvas>
            </div>
            <ChartTable
              caption={t(`chart.title_${data.unit}`)}
              head={
                <>
                  <ChartTh>{t('chart.time')}</ChartTh>
                  <ChartTh numeric>{t('devices')}</ChartTh>
                  <ChartTh numeric>{t('entries')}</ChartTh>
                  <ChartTh numeric>{t('runs')}</ChartTh>
                </>
              }
              summary={t('chart.table')}
            >
              {data.series.map((row) => (
                <tr key={row.at}>
                  <ChartTd>{label(row.at)}</ChartTd>
                  <ChartTd numeric>{formatNumber(row.devices, locale)}</ChartTd>
                  <ChartTd numeric>{formatNumber(row.entries, locale)}</ChartTd>
                  <ChartTd numeric>{formatNumber(row.runs, locale)}</ChartTd>
                </tr>
              ))}
            </ChartTable>
          </>
        ) : (
          <p className="py-10 text-center text-[14px] text-sub">{t('chart.empty')}</p>
        )}
      </div>
    </Panel>
  );
}

/** `formatAt`, because Recharts replaces a prop named `label`. */
function UsageTooltip({ active, formatAt, payload }: {
  active?: boolean;
  formatAt: (at: string) => string;
  payload?: { payload: TurtleUsageResult['series'][number] }[];
}) {
  const { t } = useTranslation('platform-turtle');
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <ChartTooltipCard title={formatAt(row.at)}>
      <ChartTooltipRow label={t('devices')} value={row.devices} />
      <ChartTooltipRow label={t('entries')} value={row.entries} />
      <ChartTooltipRow label={t('runs')} value={row.runs} />
    </ChartTooltipCard>
  );
}
