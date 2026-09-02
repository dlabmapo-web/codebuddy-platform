'use client';

import type { PlatformApplicationsSummary } from '@cove/shared';
import { Building2, CheckCircle2, Hourglass, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { cn } from '@/lib/utils';

/**
 * What the queue is, before a single row is read.
 *
 * **Two tiles, and the second is the whole page.** *Waiting* is the size of the
 * queue. *Only you* is the part of it that will still be here tomorrow if the
 * operator closes the tab — the applications sitting in academies with no
 * manager, which nobody but a platform operator is permitted to review.
 *
 * That second number is why this surface exists, so it is the one that carries
 * colour: `danger` above zero, and **`success` at zero**. The green state is
 * not decoration — it is the page telling an operator something true and worth
 * knowing, that every person waiting has a manager who can seat them and none
 * of this queue is theirs. An operator who never sees that state cannot tell
 * "I am done" from "I have not looked".
 *
 * Nothing here is a link. The counts move with the academy facet, and the
 * *Only you* filter lives in the toolbar with the others — a tile that filtered
 * on click would be a second control for a narrowing that already has one.
 */
export function ApplicationsSummary({
  summary,
}: {
  summary: PlatformApplicationsSummary;
}) {
  const { t } = useTranslation('platform-applications');
  const clear = summary.leaderless === 0;

  return (
    <section
      aria-label={t('summary.label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
      data-testid="applications-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        <h2 className="text-[15px] font-bold text-ink">{t('title')}</h2>
        <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-sub">
          <span
            aria-hidden
            className="grid size-6 place-items-center rounded-lg bg-muted text-sub"
          >
            <Building2 className="size-3.5" strokeWidth={2.5} />
          </span>
          {t('summary.scope', { count: summary.academies })}
        </p>
      </div>

      <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
        <Tile
          count={summary.waiting}
          hint={t('summary.waiting_hint', { count: summary.waiting })}
          icon={Hourglass}
          label={t('summary.waiting')}
          // `brand`, not `primary`. `primary` is the console's attention hue
          // (#E8461C), and painting the neutral count with it makes an ordinary
          // queue read as an alarm — which leaves nothing louder for the one
          // number that is one.
          tone="brand"
        />
        <Tile
          count={summary.leaderless}
          hint={t('summary.leaderless_hint', { count: summary.leaderless })}
          icon={clear ? CheckCircle2 : ShieldAlert}
          label={t('summary.leaderless')}
          // The one place on this page where a number changes its own colour.
          loud={!clear}
          tone={clear ? 'success' : 'danger'}
        />
      </div>
    </section>
  );
}

function Tile({
  count,
  hint,
  icon: Icon,
  label,
  loud = false,
  tone,
}: {
  count: number;
  hint: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  loud?: boolean;
  tone: 'brand' | 'success' | 'danger';
}) {
  const styles = toneStyles[tone];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-canvas px-4 py-3.5',
        loud ? 'border-danger/30' : 'border-border',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', styles.rail)} />
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn('grid size-9 shrink-0 place-items-center rounded-lg', styles.chip)}
        >
          <Icon className="size-[1.15rem]" strokeWidth={2.25} />
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              'block font-mono text-[22px] font-extrabold leading-none tabular-nums',
              loud ? styles.text : 'text-ink',
            )}
          >
            {count}
          </span>
          <span className="mt-1 block text-[12px] font-bold text-sub">{label}</span>
        </span>
      </div>
      <p
        className={cn(
          'mt-3 text-[12.5px] font-semibold leading-relaxed',
          loud ? styles.text : 'text-sub',
        )}
      >
        {hint}
      </p>
    </div>
  );
}
