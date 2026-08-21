'use client';

import {
  overviewRanges,
  type OverviewPeriod,
  type OverviewRange,
} from '@cove/shared';
import { CalendarRange, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { formatLocalDate } from '../../_lib/overview-view';
import { toneStyles, type PanelTone } from '../overview-ui/panel';

/**
 * The page's map and its one control, in a single bar that stays on screen.
 *
 * A curriculum overview is four screens tall on a real academy. Without a map
 * it can only be read by scrolling it end to end, and the reader has no way to
 * know what is below or to get back to what they just left. The rail is that
 * map: one chip per section, each carrying the section's hue, its icon, and its
 * count, so the bar doubles as the summary the page never had. A Team Lead can
 * see "3 to fix" without scrolling to the queue that says so.
 *
 * It sits directly under the page heading, above every section it names. That
 * is not only convention: a jump bar placed after the first sections sends the
 * reader *upward* when they click the chips for them, which reads as the page
 * losing its place rather than as navigation.
 *
 * ## Why the period control lives here
 *
 * It used to sit halfway down the page, immediately above the first section it
 * governed, so that nobody would read the blocker count as a seven-day figure.
 * The reasoning was right and the placement was not: a control a reader has to
 * scroll to find is a control most readers never find, and it split the one
 * thing that changes the page away from the top of the page.
 *
 * The concern it was solving is now handled where it belongs — every section
 * states its own window beside its own title, via `ScopeChip`. The claim and
 * its scope are inches apart instead of screens, and the control is where a
 * control goes.
 */

export type RailSection = {
  count?: number;
  icon: LucideIcon;
  id: string;
  label: string;
  tone: PanelTone;
};

export function OverviewRail({
  onRangeChange,
  period,
  range,
  sections,
}: {
  onRangeChange: (range: OverviewRange) => void;
  period: OverviewPeriod;
  range: OverviewRange;
  sections: RailSection[];
}) {
  const { t, i18n } = useTranslation('lead');
  const active = useActiveSection(sections);
  const index = overviewRanges.indexOf(range);

  return (
    <div
      className={cn(
        // Sticky only where it fits on one line. Wrapped onto three rows on a
        // phone the bar is a third of the viewport, and a map that covers the
        // thing it maps is worse than no map — there it scrolls away with the
        // page and the section chips scroll sideways instead of stacking.
        'z-[9] -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 lg:sticky lg:top-14',
        'rounded-card border border-border bg-card/90 px-2.5 py-2 backdrop-blur-md',
        'shadow-[var(--shadow-card)]',
      )}
    >
      <nav aria-label={t('nav.label')} className="min-w-0 max-w-full">
        <ul className="flex flex-nowrap items-center gap-1 overflow-x-auto lg:flex-wrap lg:overflow-visible">
          {sections.map((section) => {
            const styles = toneStyles[section.tone];
            const isActive = active === section.id;
            return (
              <li key={section.id}>
                <a
                  aria-current={isActive ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    isActive
                      ? cn(styles.chip, 'shadow-[var(--shadow-card)]')
                      : 'text-sub hover:bg-accent hover:text-ink',
                  )}
                  href={`#${section.id}`}
                >
                  <section.icon
                    aria-hidden
                    className={cn('size-4 shrink-0', !isActive && styles.text)}
                    strokeWidth={2.25}
                  />
                  <span className="whitespace-nowrap">{section.label}</span>
                  {section.count !== undefined ? (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px font-mono text-[11px] font-bold tabular-nums',
                        isActive ? 'bg-card/70' : styles.pill,
                      )}
                    >
                      {section.count}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2.5">
        <fieldset className="relative grid grid-cols-3 rounded-xl bg-accent p-1">
          <legend className="sr-only">{t('period.legend')}</legend>
          <span
            aria-hidden
            className={cn(
              'absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-brand',
              'shadow-[var(--shadow-card)]',
              'transition-transform duration-300 ease-out motion-reduce:transition-none',
            )}
            style={{ transform: `translateX(${index * 100}%)` }}
          />
          {overviewRanges.map((option) => (
            <button
              aria-pressed={range === option}
              className={cn(
                'relative z-10 h-7 whitespace-nowrap rounded-lg px-3 text-[12px] font-bold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                range === option ? 'text-on-brand' : 'text-sub hover:text-ink',
              )}
              key={option}
              onClick={() => onRangeChange(option)}
              type="button"
            >
              {t(`period.range_${option}`)}
            </button>
          ))}
        </fieldset>

        <p className="flex items-center gap-1.5 pr-1">
          <CalendarRange aria-hidden className="size-3.5 shrink-0 text-sub" />
          <span className="font-mono text-[11.5px] font-bold tabular-nums text-sub">
            {period.startDate
              ? t('period.window', {
                  from: formatLocalDate(period.startDate, i18n.language),
                  to: formatLocalDate(period.endDate, i18n.language),
                })
              : t('period.window_all', {
                  to: formatLocalDate(period.endDate, i18n.language),
                })}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Which section the reader is currently looking at.
 *
 * The top fifth of the viewport is the reading line, so a section counts as
 * active once its heading clears the sticky bars rather than when it first
 * appears at the bottom of the screen — otherwise the rail would highlight
 * whatever is furthest from where the eye is.
 *
 * Falls back to nothing rather than guessing: a rail with no chip lit is
 * honest, and a rail lighting the wrong chip is worse than an unlit one.
 */
function useActiveSection(sections: RailSection[]): string | null {
  const [active, setActive] = React.useState<string | null>(null);
  const ids = sections.map((section) => section.id).join(',');

  React.useEffect(() => {
    const nodes = ids
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first in document order, so scrolling down does not light the
        // section below the one being read.
        const first = nodes.find((node) => visible.has(node.id));
        setActive(first?.id ?? null);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
