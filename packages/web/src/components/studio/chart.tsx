'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The V2 chart frame: everything a chart needs that is not the chart.
 *
 * Recharts is a rendering dependency here and nothing more. No classification,
 * ordering, or authorization lives in a chart component — those are decided in
 * `@cove/shared` and arrive as data — and no chart owns its own colours, axis
 * style, tooltip, legend, empty state, or accessible fallback. One place for
 * those is what keeps six charts on one page reading as one system instead of
 * six libraries.
 *
 * Three properties every chart built on this inherits.
 *
 * Colour never carries meaning alone: `chartSeries` pairs each meaning with a
 * shape, and the legend prints both. A reader who cannot separate the blue from
 * the green still gets the answer.
 *
 * Every chart has a table. `ChartTable` renders the same numbers as real
 * markup, which is what a screen reader, a keyboard, and a teacher pasting into
 * a message all actually need.
 *
 * Nothing animates for a reader who asked for no animation.
 *
 * See §8.1 and §10 of the teacher academy overview design.
 */

/**
 * The five meanings the overview's charts encode, as tokens.
 *
 * Every value is a theme variable rather than a literal, so the palette follows
 * light and dark without a `dark:` variant anywhere in a chart. The mapping is
 * §10's: blue is neutral or selected data, green is a threshold met, amber is a
 * watch signal, red is a factual attention condition, and grey is insufficient
 * data — never "good child" and "bad child".
 */
export const chartTokens = {
  brand: 'var(--brand)',
  brandSoft: 'var(--brand-soft)',
  // The teaching overview gives each section a hue; a chart inside one draws in
  // its section's colour rather than in a chart-only palette, so the plot and
  // the panel around it are visibly the same claim.
  peer: 'var(--peer)',
  peerSoft: 'var(--peer-soft)',
  teal: 'var(--teal)',
  tealSoft: 'var(--teal-soft)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  neutral: 'var(--retired)',
  grid: 'var(--border)',
  axis: 'var(--sub)',
  surface: 'var(--card)',
  ink: 'var(--ink)',
} as const;

/** A Recharts scatter symbol, chosen so the five kinds differ by silhouette. */
export type ChartSymbol = 'circle' | 'diamond' | 'triangle' | 'square' | 'cross';

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  symbol: ChartSymbol;
};

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(notify: () => void): () => void {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
}

/**
 * Whether this reader asked for no animation.
 *
 * The preference is an external store, not React state, so it is read through
 * `useSyncExternalStore`: the value is correct on the first client render
 * rather than one render after it, and a reader who changes the setting with
 * the page open gets charts that stop moving without a reload.
 *
 * The server snapshot is `false` because the server cannot know, and animating
 * once before hydration is the harmless direction of that guess.
 */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

/**
 * A chart's box, sized before its data arrives.
 *
 * The height is fixed by the caller so a loading skeleton, an empty state, and
 * a rendered chart all occupy exactly the same space. A page whose panels
 * resize as each aggregate lands is a page a teacher cannot read while it
 * loads.
 *
 * `role="img"` with a written label is what a screen reader announces before
 * reaching the table below it — the visual is summarized, not narrated.
 */
export function ChartCanvas({
  children,
  className,
  height,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  height: number;
  label: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn('w-full', className)}
      role="img"
      style={{ height }}
    >
      {children}
    </div>
  );
}

/**
 * The legend, as shape plus colour plus word.
 *
 * Rendered outside the SVG so every entry is selectable text, and so a long
 * Korean label wraps rather than being clipped by the plot area.
 */
export function ChartLegend({
  onToggle,
  hidden,
  series,
}: {
  /** Optional local hiding. It never changes what the server was asked for. */
  onToggle?: (key: string) => void;
  hidden?: Set<string>;
  series: ChartSeries[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((entry) => {
        const isHidden = hidden?.has(entry.key) ?? false;
        const content = (
          <>
            <ChartGlyph color={entry.color} symbol={entry.symbol} />
            <span className={cn(isHidden && 'line-through')}>{entry.label}</span>
          </>
        );
        return (
          <li key={entry.key}>
            {onToggle ? (
              <button
                aria-pressed={!isHidden}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[12px] font-semibold text-sub',
                  'transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  isHidden && 'opacity-55',
                )}
                onClick={() => onToggle(entry.key)}
                type="button"
              >
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-1 py-0.5 text-[12px] font-semibold text-sub">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The legend's mark, drawn to match the symbol the plot uses. */
export function ChartGlyph({
  color,
  symbol,
}: {
  color: string;
  symbol: ChartSymbol;
}) {
  const shapes: Record<ChartSymbol, React.ReactNode> = {
    circle: <circle cx="5" cy="5" fill={color} r="4.5" />,
    diamond: <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} />,
    triangle: <path d="M5 0.5 L9.8 9.5 L0.2 9.5 Z" fill={color} />,
    square: <rect fill={color} height="9" rx="1.5" width="9" x="0.5" y="0.5" />,
    cross: (
      <path
        d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    ),
  };
  return (
    <svg
      aria-hidden
      className="shrink-0"
      height="10"
      viewBox="0 0 10 10"
      width="10"
    >
      {shapes[symbol]}
    </svg>
  );
}

/**
 * The tooltip surface, shared by every chart.
 *
 * A plain card rather than Recharts' default box: it has to sit on both themes,
 * and it has to be able to hold several labelled rows, because a point on this
 * page is never one number — a student's time means nothing without their
 * mastery beside it.
 */
export function ChartTooltipCard({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="pointer-events-none min-w-[11rem] rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-modal)]">
      <p className="truncate text-[13px] font-bold text-ink">{title}</p>
      {subtitle ? (
        <p className="mt-0.5 truncate text-[11.5px] text-sub">{subtitle}</p>
      ) : null}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
        {children}
      </dl>
    </div>
  );
}

export function ChartTooltipRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-sub">{label}</dt>
      <dd className="text-right font-mono tabular-nums font-semibold text-ink">
        {value}
      </dd>
    </>
  );
}

/**
 * The same data as markup, one disclosure below the plot.
 *
 * Collapsed rather than hidden: it is the chart's equivalent, not its
 * afterthought, so it is reachable by keyboard, readable by a screen reader,
 * and copyable by a teacher who wants the numbers in a message home.
 */
export function ChartTable({
  caption,
  children,
  head,
  summary,
}: {
  caption: string;
  children: React.ReactNode;
  head: React.ReactNode;
  summary: string;
}) {
  return (
    <details className="group mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer list-none text-[12px] font-bold text-sub transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
          >
            ›
          </span>
          {summary}
        </span>
      </summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-left">{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartTh({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-sub',
        numeric && 'text-right',
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function ChartTd({
  children,
  numeric = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'border-b border-border/60 px-2 py-1.5',
        numeric && 'text-right font-mono tabular-nums',
      )}
    >
      {children}
    </td>
  );
}

/**
 * A chart with nothing to draw.
 *
 * Never an axis with no marks on it: a plot drawn over no data reads as a
 * measurement of zero, and the difference between "nobody worked" and "nothing
 * was tracked" is the whole message.
 */
export function ChartEmpty({
  body,
  height,
  title,
}: {
  body: string;
  height: number;
  title: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center"
      style={{ height }}
    >
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-[1.6] text-sub">
        {body}
      </p>
    </div>
  );
}

/** A placeholder of exactly the chart's dimensions, so nothing shifts. */
export function ChartSkeleton({
  height,
  label,
}: {
  height: number;
  label: string;
}) {
  return (
    <div
      aria-live="polite"
      className="animate-pulse rounded-lg bg-accent motion-reduce:animate-none"
      style={{ height }}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** The axis styling every chart shares, as props to spread. */
export const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: chartTokens.axis, fontSize: 11 },
} as const;

export const gridProps = {
  stroke: chartTokens.grid,
  strokeDasharray: '2 4',
  vertical: false,
} as const;
