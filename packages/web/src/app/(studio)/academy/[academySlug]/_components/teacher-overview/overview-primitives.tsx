'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay } from '../../_lib/overview-view';
import { toneStyles, type PanelTone } from '../overview-ui/panel';

/**
 * The teaching overview's own primitives: the ones that speak.
 *
 * `Duration`, `Percent`, and `SectionUnavailable` all read the `teaching`
 * namespace, which is what keeps them here rather than in `overview-ui` beside
 * `Panel` — a primitive that fetches its own copy can only ever belong to one
 * page. The silent parts are re-exported so this module stays the one import
 * every teaching section reaches for.
 */

export {
  Avatar,
  EmptyState,
  Meter,
  Panel,
  toneStyles,
  type PanelTone,
} from '../overview-ui/panel';
/* ------------------------------------------------------------ measurements */

/** A measured duration, or the fact that nothing was measured. */
export function Duration({
  className,
  seconds,
}: {
  className?: string;
  seconds: number | null;
}) {
  const { t } = useTranslation('teaching');
  const display = durationDisplay(seconds);

  if (display.kind === 'none') {
    return (
      <span className={cn('text-sub', className)} title={t('duration.none')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('duration.none')}</span>
      </span>
    );
  }

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
  const { t } = useTranslation('teaching');
  if (value === null) {
    return (
      <span className="text-sub" title={t('no_data')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('no_data')}</span>
      </span>
    );
  }
  return (
    <span className="font-mono tabular-nums">{t('percent', { value })}</span>
  );
}
/**
 * One section that could not be computed.
 *
 * Named as an outage, in the panel's own space, with the rest of the page
 * intact. §6.10 — a failure rendered as an empty class is worse than an error,
 * because a teacher would believe it.
 */
export function SectionUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation('teaching');
  return (
    <div className="m-4 rounded-lg border border-danger/25 bg-danger/5 p-4" role="alert">
      <p className="text-[13px] font-bold text-danger">
        {t('unavailable.title')}
      </p>
      <p className="mt-1 text-[12.5px] leading-[1.6] text-sub">
        {t('unavailable.body')}
      </p>
      <button
        className="mt-3 inline-flex h-8 items-center rounded-md border border-danger/30 px-2.5 text-[12.5px] font-bold text-danger transition-colors hover:bg-danger/10"
        onClick={onRetry}
        type="button"
      >
        {t('retry')}
      </button>
    </div>
  );
}

/** The curriculum coordinate a signal sits at, printed the way the outline does. */
export function CurriculumPath({
  course,
  lecture,
  module,
  outlineNumber,
  tone = 'brand',
}: {
  course: string;
  lecture?: string;
  module?: string;
  outlineNumber?: string | null;
  tone?: PanelTone;
}) {
  const parts = [course, module, lecture].filter(Boolean) as string[];
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-sub">
      {outlineNumber ? (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums',
            toneStyles[tone].pill,
          )}
        >
          {outlineNumber}
        </span>
      ) : null}
      <span className="truncate">{parts.join(' · ')}</span>
    </span>
  );
}
