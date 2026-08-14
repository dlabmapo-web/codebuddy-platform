'use client';

import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { durationDisplay, meterWidth } from '../../_lib/overview-view';

/**
 * The small parts the overview is built from.
 *
 * They exist so the page reads as one surface: a panel header always carries
 * its own denominator, a measurement is always in tabular figures, a missing
 * number is always an em dash with a spoken label. Repeating those decisions
 * per section is how a dashboard ends up with four slightly different progress
 * bars and three ways of saying "no data".
 *
 * ## Why the page is coloured
 *
 * Seven sections, seven questions, and — before this — seven identical white
 * cards. A teacher scrolling past the third one had nothing to tell them which
 * question they had landed on, and the page's whole job is to be read quickly.
 *
 * So each section owns a hue, and the hue is the answer to "which question is
 * this": orange asks who needs me, blue asks how big this is, violet asks who
 * worked, green asks who is furthest along, teal asks how much time, amber asks
 * what the class is not ready for, red asks what is blocking them. It appears
 * as a rail across the top of the card, an icon in the header, and the section's
 * own accents — the body of every panel stays a plain reading surface.
 *
 * The one rule that does not bend: colour identifies a *section* or a
 * *measurement*, never a child. There is no green student and no red student on
 * this page. §4 rules out a page that sorts children into good and bad, and a
 * palette that cannot express it is how that stays true when somebody adds a
 * section next year.
 */

/* ------------------------------------------------------------------ tones */

export type PanelTone =
  | 'primary'
  | 'brand'
  | 'peer'
  | 'success'
  | 'teal'
  | 'warning'
  | 'danger';

/**
 * Each tone as complete class strings rather than composed ones.
 *
 * Tailwind reads source text, so `bg-${tone}/10` would be a class that never
 * ships. Written out, every variant is guaranteed to exist in the stylesheet —
 * and the table doubles as the page's colour legend in one place.
 */
export const toneStyles: Record<
  PanelTone,
  { rail: string; chip: string; pill: string; text: string; meter: string }
> = {
  primary: {
    rail: 'bg-primary',
    chip: 'bg-primary/10 text-primary',
    pill: 'bg-primary/10 text-primary',
    text: 'text-primary',
    meter: 'bg-primary',
  },
  brand: {
    rail: 'bg-brand',
    chip: 'bg-brand/10 text-brand',
    pill: 'bg-brand/10 text-brand',
    text: 'text-brand',
    meter: 'bg-brand',
  },
  peer: {
    rail: 'bg-peer',
    chip: 'bg-peer/10 text-peer',
    pill: 'bg-peer/10 text-peer',
    text: 'text-peer',
    meter: 'bg-peer',
  },
  success: {
    rail: 'bg-success',
    chip: 'bg-success/10 text-success',
    pill: 'bg-success/10 text-success',
    text: 'text-success',
    meter: 'bg-success',
  },
  teal: {
    rail: 'bg-teal',
    chip: 'bg-teal/10 text-teal',
    pill: 'bg-teal/10 text-teal',
    text: 'text-teal',
    meter: 'bg-teal',
  },
  warning: {
    rail: 'bg-warning',
    chip: 'bg-warning/10 text-warning',
    pill: 'bg-warning/10 text-warning',
    text: 'text-warning',
    meter: 'bg-warning',
  },
  danger: {
    rail: 'bg-danger',
    chip: 'bg-danger/10 text-danger',
    pill: 'bg-danger/10 text-danger',
    text: 'text-danger',
    meter: 'bg-danger',
  },
};

/* ------------------------------------------------------------------ panel */

/**
 * A region of the page.
 *
 * `meta` is the structural device the whole page uses: every panel states the
 * denominator its numbers are measured against, right beside its title. It is
 * information rather than decoration — a section that cannot name its own
 * denominator is a section whose numbers cannot be checked.
 *
 * The rail and the icon are the section's identity. They are the same hue by
 * construction rather than by two callers agreeing, so a section cannot end up
 * with a blue icon over a green rail.
 */
export function Panel({
  actions,
  children,
  className,
  description,
  icon: Icon,
  id,
  meta,
  testId,
  title,
  tone = 'brand',
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  icon?: LucideIcon;
  id?: string;
  meta?: React.ReactNode;
  testId?: string;
  title: string;
  tone?: PanelTone;
}) {
  const headingId = id ? `${id}-title` : undefined;
  const styles = toneStyles[tone];

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'overflow-hidden rounded-card border border-border bg-card',
        'shadow-[var(--shadow-card)]',
        className,
      )}
      data-testid={testId}
      id={id}
    >
      {/* The section's colour, as a band rather than a border: at a glance down
          a long page this is what says which question is below it. */}
      <div aria-hidden className={cn('h-1 w-full', styles.rail)} />

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-b border-border px-4 py-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {Icon ? (
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                styles.chip,
              )}
            >
              <Icon className="size-[1.15rem]" strokeWidth={2.25} />
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]" id={headingId}>
                {title}
              </h2>
              {meta ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
                    styles.pill,
                  )}
                >
                  {meta}
                </span>
              ) : null}
            </div>
            {description ? (
              <p className="mt-1 max-w-2xl text-[12.5px] leading-[1.55] text-sub">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- avatar */

/**
 * The six hues a student's initial disc can take.
 *
 * Identity, not judgement — the same idea as an avatar colour in any messaging
 * app. It is derived from the membership id so one child keeps one colour on
 * every list they appear in, which is what makes a roster scannable without
 * reading a single name.
 *
 * The two hues the page uses to *mean* something are deliberately absent:
 * action orange says "act on this" and red says "this is blocked", and a
 * student who happened to hash into either would look flagged when they are
 * not.
 */
const avatarTones = [
  'bg-brand/12 text-brand',
  'bg-peer/12 text-peer',
  'bg-teal/12 text-teal',
  'bg-success/12 text-success',
  'bg-draft/12 text-draft',
  'bg-unstable/12 text-unstable',
] as const;

export function Avatar({
  id,
  name,
  size = 'md',
}: {
  id: string;
  name: string;
  size?: 'sm' | 'md';
}) {
  // A cheap stable hash. It only has to spread six ways and never change for
  // the same student, and both are true of summing the code points.
  const hash = React.useMemo(
    () => [...id].reduce((total, character) => total + character.charCodeAt(0), 0),
    [id],
  );
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold',
        size === 'sm' ? 'size-7 text-[12px]' : 'size-9 text-[14px]',
        avatarTones[hash % avatarTones.length],
      )}
    >
      {initial}
    </span>
  );
}

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

/** A progress bar that always carries its own accessible name. */
export function Meter({
  label,
  percent,
  tone = 'brand',
}: {
  label: string;
  percent: number | null;
  tone?: PanelTone;
}) {
  return (
    <span
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent ?? 0}
      className="block h-2 w-full overflow-hidden rounded-full bg-accent"
      role="progressbar"
    >
      <span
        className={cn(
          'block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
          toneStyles[tone].meter,
        )}
        style={{ width: meterWidth(percent) }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------- states */

/**
 * An empty state that says which emptiness this is, and what to do next.
 *
 * The icon is what stops it reading as a broken panel. A block of grey text in
 * the middle of a card looks like something failed; the same words under the
 * section's own quiet mark look like an answer, which is what they are.
 */
export function EmptyState({
  action,
  body,
  icon: Icon,
  title,
  tone = 'brand',
}: {
  action?: React.ReactNode;
  body: string;
  icon?: LucideIcon;
  title: string;
  tone?: PanelTone;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon ? (
        <span
          aria-hidden
          className={cn(
            'mb-3 grid size-11 place-items-center rounded-2xl',
            toneStyles[tone].chip,
          )}
        >
          <Icon className="size-5" strokeWidth={2} />
        </span>
      ) : null}
      <h3 className="text-[14px] font-bold">{title}</h3>
      <p className="mt-1.5 max-w-md text-[12.5px] leading-[1.6] text-sub">
        {body}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
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
