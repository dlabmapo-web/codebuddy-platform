'use client';

import type { TeacherProgressStatus } from '@cove/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay, meterWidth, statusTones } from '../_lib/progress-view';

/**
 * The small parts every region of Solution status is built from.
 *
 * They exist so the page reads as one surface: a meter always carries its
 * counts, a missing measurement is always an em dash with a spoken label, and
 * every table has real headers. Repeating those decisions per region is how a
 * page ends up with four slightly different progress bars.
 */

/**
 * A progress bar that always says what it means.
 *
 * The label is required rather than optional: §18 makes the accessible name
 * carry the student or the problem, and a bar with a percentage nobody can
 * read is decoration.
 */
export function Meter({
  label,
  percent,
  tone = 'brand',
}: {
  label: string;
  percent: number;
  tone?: 'brand' | 'quiet';
}) {
  return (
    <span
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-accent"
      role="progressbar"
    >
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
          // One accent for progress everywhere. It never turns red at a low
          // value: this is a class reading its own work, not a grade.
          tone === 'brand' ? 'bg-brand' : 'bg-sub/40',
        )}
        style={{ width: meterWidth(percent) }}
      />
    </span>
  );
}

/** Solved / eligible, printed beside its own meter. */
export function ProgressCell({
  label,
  percent,
  solved,
  total,
}: {
  label: string;
  percent: number;
  solved: number;
  total: number;
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-col gap-1.5">
      <span className="font-mono text-[12.5px] tabular-nums text-sub">
        {solved}
        <span className="mx-0.5 text-sub/50">/</span>
        {total}
      </span>
      <Meter label={label} percent={percent} />
    </div>
  );
}

export function StatusBadge({ status }: { status: TeacherProgressStatus }) {
  const { t } = useTranslation('teach');
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold',
        statusTones[status],
      )}
    >
      {t(`progress.status.${status}`)}
    </span>
  );
}

/**
 * A measured duration, or the fact that nobody measured one.
 *
 * The em dash is decorative and the sentence is the content, so a screen
 * reader hears "Not recorded" rather than a dash.
 */
export function Duration({ seconds }: { seconds: number | null }) {
  const { t } = useTranslation('teach');
  const display = durationDisplay(seconds);

  if (display.kind === 'missing') {
    return (
      <span className="text-sub" title={t('progress.duration.missing')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('progress.duration.missing')}</span>
      </span>
    );
  }

  const text =
    display.kind === 'hours'
      ? t('progress.duration.hours', {
          hours: display.hours,
          minutes: display.minutes,
        })
      : display.kind === 'minutes'
        ? t('progress.duration.minutes', {
            minutes: display.minutes,
            seconds: display.seconds,
          })
        : t('progress.duration.seconds', { seconds: display.seconds });

  return (
    <span className="whitespace-nowrap font-mono tabular-nums">{text}</span>
  );
}

/**
 * A region of the page that can load, fail, and be retried on its own.
 *
 * The last successful content stays mounted while a child loads, which is what
 * keeps a curriculum hierarchy from collapsing every time a lecture is opened.
 */
export function Panel({
  actions,
  children,
  className,
  description,
  title,
  titleId,
  titleRef,
  titleTabIndex,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  title: React.ReactNode;
  titleId?: string;
  titleRef?: React.Ref<HTMLHeadingElement>;
  titleTabIndex?: number;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'rounded-card border border-border bg-card',
        'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2
            className="text-[14.5px] font-bold outline-none"
            id={titleId}
            ref={titleRef}
            tabIndex={titleTabIndex}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-sub">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/** A skeleton for exactly the region being replaced, and nothing above it. */
export function RegionLoading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation('teach');
  return (
    <div aria-live="polite" className="space-y-2 p-4">
      <span className="sr-only">{t('progress.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span
          className="block h-9 animate-pulse rounded-md bg-accent motion-reduce:animate-none"
          key={index}
        />
      ))}
    </div>
  );
}

/**
 * A failure with nothing to fall back on.
 *
 * Never rendered as an empty table: a service outage that reads as "no
 * students" is worse than an error, because a teacher would believe it.
 */
export function RegionError({
  body,
  onRetry,
  title,
}: {
  body: string;
  onRetry: () => void;
  title: string;
}) {
  const { t } = useTranslation('teach');
  return (
    <div className="rounded-card border border-danger/25 bg-danger/5 p-5" role="alert">
      <h2 className="text-[15px] font-bold text-danger">{title}</h2>
      <p className="mt-1.5 text-[13.5px] leading-6 text-sub">{body}</p>
      <button
        className="mt-3 inline-flex h-9 items-center rounded-lg border border-danger/30 px-3 text-[13.5px] font-bold text-danger transition-colors hover:bg-danger/10"
        onClick={onRetry}
        type="button"
      >
        {t('progress.retry')}
      </button>
    </div>
  );
}

/** A refetch failure with rows still on screen. The rows stay; this warns. */
export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('teach');
  return (
    <p
      className="flex flex-wrap items-center gap-3 rounded-card border border-danger/25 bg-danger/5 px-4 py-2.5 text-[13px] font-semibold text-danger"
      role="alert"
    >
      {t('progress.error.refresh_failed')}
      <button
        className="rounded-md border border-danger/30 px-2 py-0.5 text-[12.5px] font-bold transition-colors hover:bg-danger/10"
        onClick={onRetry}
        type="button"
      >
        {t('progress.retry')}
      </button>
    </p>
  );
}

/** An empty state that says which emptiness this is, and what to do about it. */
export function EmptyState({
  action,
  body,
  title,
}: {
  action?: React.ReactNode;
  body: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <h3 className="text-[14.5px] font-bold">{title}</h3>
      <p className="mt-1.5 max-w-md text-[13px] leading-6 text-sub">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Server paging, as two buttons and a position.
 *
 * Deliberately not a page-number strip: the pages here are a scroll through a
 * roster, not destinations worth naming.
 */
export function Pager({
  onPageChange,
  page,
  pageCount,
}: {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
}) {
  const { t } = useTranslation(['teach', 'common']);
  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
      <span className="text-[12.5px] tabular-nums text-sub">
        {page} / {pageCount}
      </span>
      <button
        aria-label={t('common:pagination.previous')}
        className="grid size-8 place-items-center rounded-md border border-border bg-card text-sub transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-35"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        aria-label={t('common:pagination.next')}
        className="grid size-8 place-items-center rounded-md border border-border bg-card text-sub transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-35"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/**
 * A dense table for repeated comparable fields.
 *
 * Wrapped in its own horizontal scroller so a wide table never makes the page
 * scroll sideways — and every column that matters is repeated in the stacked
 * mobile summaries the row components render instead below `sm`.
 */
export function DataGrid({
  children,
  head,
}: {
  children: React.ReactNode;
  head: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13.5px]">
        <thead className="border-b border-border">
          <tr className="text-left">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  numeric = false,
}: {
  children: React.ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub',
        numeric && 'text-right',
        className,
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  numeric = false,
}: {
  children: React.ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-4 py-2.5 align-middle',
        numeric && 'text-right font-mono tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}
