'use client';

import { overviewRanges, type OverviewPeriod, type OverviewRange } from '@cove/shared';
import { CalendarRange } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { formatLocalDate } from '../../_lib/overview-view';

/**
 * The period control, and the period it resolves to, as one object.
 *
 * Before this they were two: three buttons that said "7 days", and a separate
 * chip forty pixels away that said which seven days. A teacher checking what
 * they were looking at had to read the control, then find its consequence
 * somewhere else on the bar. Putting the answer inside the control that
 * produced it is the whole idea — the thing that chooses the window is the
 * thing that states it.
 *
 * That is also what §5.3 asks for. "7 days" means different days to a teacher
 * opening the page at 00:30 than at 23:30, and a screenshot of this page should
 * still be readable next month; printing the effective dates and the timezone
 * beside the switch rather than in a caption is the strongest place to satisfy
 * it, because the two can never drift apart.
 *
 * The three options are not three unrelated choices — each window contains the
 * one before it — so the selected segment is a single indicator that *slides*
 * between them rather than three lamps that light independently. It is one
 * window being widened, and the motion says so. Reduced-motion readers get the
 * same indicator without the travel.
 */
export function RangePicker({
  onChange,
  period,
  value,
}: {
  onChange: (range: OverviewRange) => void;
  /** Absent until the first response lands; the switch still works without it. */
  period?: OverviewPeriod;
  value: OverviewRange;
}) {
  const { t, i18n } = useTranslation('teaching');
  const index = overviewRanges.indexOf(value);

  return (
    <div className="inline-flex flex-wrap items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <fieldset className="relative grid grid-cols-3 gap-0 p-1">
        <legend className="sr-only">{t('filters.range')}</legend>

        {/*
         * One indicator for three segments, moved by transform rather than by
         * re-painting a background per button: the columns are equal, so its
         * position is entirely a function of the selected index, and it cannot
         * end up under two segments or under none.
         */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-brand',
            'transition-transform duration-300 ease-out motion-reduce:transition-none',
          )}
          style={{ transform: `translateX(${index * 100}%)` }}
        />

        {overviewRanges.map((range) => (
          <button
            aria-pressed={value === range}
            className={cn(
              'relative z-10 h-8 whitespace-nowrap rounded-lg px-3.5 text-[12.5px] font-bold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              value === range ? 'text-on-brand' : 'text-sub hover:text-ink',
            )}
            key={range}
            onClick={() => onChange(range)}
            type="button"
          >
            {t(`filters.range_${range}`)}
          </button>
        ))}
      </fieldset>

      {period ? (
        <p className="flex items-center gap-2 border-l border-border px-3 py-1">
          <CalendarRange aria-hidden className="size-4 shrink-0 text-brand" />
          {/*
           * A floor rather than a fixed width: "Aug 8 – Aug 14" and "Up to
           * Aug 14" are different lengths, and without it the whole control —
           * and every control after it on the bar — would shift sideways each
           * time a teacher changed the period.
           */}
          <span className="flex min-w-[8.5rem] flex-col leading-tight">
            <span className="font-mono text-[12px] font-bold tabular-nums text-ink">
              {period.startDate
                ? t('scope.window', {
                    from: formatLocalDate(period.startDate, i18n.language),
                    to: formatLocalDate(period.endDate, i18n.language),
                  })
                : t('scope.window_all', {
                    to: formatLocalDate(period.endDate, i18n.language),
                  })}
            </span>
            {/*
             * The timezone is small but never omitted. An evening class sits on
             * one side of midnight in Seoul and the other in UTC, and a teacher
             * comparing this page to their register needs to know which.
             */}
            <span className="text-[10.5px] font-semibold text-sub">
              {period.timeZone}
            </span>
          </span>
        </p>
      ) : null}
    </div>
  );
}
