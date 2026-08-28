'use client';

import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay } from '../../_lib/overview-view';
import { toneStyles, type PanelTone } from '../overview-ui/panel';

/**
 * The student overview's own primitives: the ones that speak.
 *
 * `Duration`, `Percent`, `Missing`, and `SectionUnavailable` all read the
 * `learning` namespace, which is what keeps them here rather than in
 * `overview-ui` beside `Panel` — a primitive that fetches its own copy can
 * only ever belong to one page. The silent parts are re-exported so this
 * module stays the one import every student section reaches for.
 */

export {
  EmptyState,
  Meter,
  Panel,
  toneStyles,
  type PanelTone,
} from '../overview-ui/panel';

/** A measured duration, or the fact that nothing was measured. */
export function Duration({
  className,
  seconds,
}: {
  className?: string;
  seconds: number | null;
}) {
  const { t } = useTranslation('learning');
  const display = durationDisplay(seconds);

  if (display.kind === 'none') return <Missing label={t('duration.none')} />;

  return (
    <span className={cn('whitespace-nowrap font-mono tabular-nums', className)}>
      {display.kind === 'hours'
        ? t('duration.hours', {
            hours: display.hours,
            minutes: display.minutes,
          })
        : t('duration.minutes', { minutes: display.minutes })}
    </span>
  );
}

/** A percentage that says so, or an em dash that says why not. */
export function Percent({ value }: { value: number | null }) {
  const { t } = useTranslation('learning');
  if (value === null) return <Missing label={t('no_data')} />;
  return <span className="font-mono tabular-nums">{t('percent', { value })}</span>;
}

/**
 * A number that is absent, said out loud.
 *
 * An em dash for the eye and a sentence for a screen reader. A child who has
 * not started is not a child scoring nought, and this is the shape that keeps
 * the page from printing one as the other.
 */
export function Missing({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const { t } = useTranslation('learning');
  const text = label ?? t('no_data');
  return (
    <span className={cn('text-sub', className)} title={text}>
      <span aria-hidden>—</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/**
 * One section that could not be computed.
 *
 * Named as an outage, in the panel's own space, with the rest of the page
 * intact. §12 — a failure rendered as an empty week is worse than an error,
 * because a child would believe it.
 */
export function SectionUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('learning');
  return (
    <div
      className="m-4 rounded-lg border border-danger/25 bg-danger/5 p-4"
      role="alert"
    >
      <p className="text-[13px] font-bold text-danger">
        {t('unavailable.title')}
      </p>
      <p className="mt-1 text-[12.5px] leading-[1.6] text-sub">
        {t('unavailable.body')}
      </p>
      <button
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/30 px-2.5 text-[12.5px] font-bold text-danger transition-colors hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden className="size-3.5" />
        {t('retry')}
      </button>
    </div>
  );
}

/**
 * The curriculum coordinate an exercise sits at.
 *
 * `2-3-4` is the module, the lecture, and the problem — the same numbering the
 * course outline prints and the same one a teacher says out loud. It is
 * information a child navigates by, which is why it is a monospace chip rather
 * than a decoration, and why it appears on every row that points at a problem.
 */
export function OutlineChip({
  className,
  size = 'sm',
  tone = 'brand',
  value,
}: {
  className?: string;
  size?: 'sm' | 'lg';
  tone?: PanelTone;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md font-mono font-bold tabular-nums',
        size === 'lg'
          ? 'px-2.5 py-1 text-[15px] tracking-[-0.02em]'
          : 'px-1.5 py-0.5 text-[11px]',
        toneStyles[tone].pill,
        className,
      )}
    >
      {value}
    </span>
  );
}

/** Course · Module · Lecture, in the order the outline reads them. */
export function CurriculumPath({
  course,
  lecture,
  module,
}: {
  course: string;
  lecture?: string | null;
  module?: string | null;
}) {
  const parts = [course, module, lecture].filter(Boolean) as string[];
  return (
    <span className="block truncate text-[11.5px] leading-[1.5] text-sub">
      {parts.join(' · ')}
    </span>
  );
}

/** A relative moment a child would say out loud: today, yesterday, a date. */
export function useRelativeDay() {
  const { t, i18n } = useTranslation('learning');
  return React.useCallback(
    (iso: string | null): string | null => {
      if (!iso) return null;
      const then = new Date(iso);
      if (Number.isNaN(then.getTime())) return null;
      const days = Math.floor(
        (startOfDay(new Date()).getTime() - startOfDay(then).getTime()) /
          86_400_000,
      );
      if (days <= 0) return t('when.today');
      if (days === 1) return t('when.yesterday');
      if (days < 7) return t('when.days_ago', { count: days });
      return new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
      }).format(then);
    },
    [i18n.language, t],
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
