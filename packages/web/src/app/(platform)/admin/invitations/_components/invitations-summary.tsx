'use client';

import type { PlatformInvitationsSummary } from '@cove/shared';
import { Building2, Hourglass, MailWarning, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { toneStyles } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { cn } from '@/lib/utils';

/**
 * What the queue is, before a single row is read.
 *
 * **Three tiles, and the third is the whole page.** *Invitations* is the size
 * of it. *Pending* is what is still open, with the ones about to lapse named
 * underneath — nothing failed there, but a seat is being given back. *Bounced*
 * is what went nowhere, and its second line is the part that will still be here
 * tomorrow if the operator closes the tab: the failures in academies with no
 * manager, which nobody but a platform operator can resend.
 *
 * That last number carries the colour — `danger` above zero, and **`success` at
 * zero**, the same rule the applications queue's *Only you* tile follows. The
 * green state is not decoration: it is the page saying that every failed
 * invitation has somebody who can retry it, and an operator who never sees it
 * cannot tell "I am done" from "I have not looked".
 *
 * Nothing here is a link. The counts move with the academy facet, and the
 * narrowings they describe already live in the toolbar — a tile that filtered
 * on click would be a second control for one act.
 */
export function InvitationsSummary({
  academyName,
  summary,
}: {
  /** The one academy in scope, when the facet holds exactly one. */
  academyName?: string | null;
  summary: PlatformInvitationsSummary;
}) {
  const { t } = useTranslation('platform-invitations');
  const clear = summary.bouncedLeaderless === 0;

  return (
    <section
      aria-label={t('summary.label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
      data-testid="invitations-summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        {/* Scoped to one academy, the strip is that academy's card and the
            thing to read first is whose — the treatment the curriculum pages'
            summary takes for the same reason. */}
        <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-ink">
          {academyName ? (
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-sub"
            >
              <Building2 className="size-3.5" strokeWidth={2.5} />
            </span>
          ) : null}
          <span className="truncate">{academyName ?? t('title')}</span>
        </h2>
        {academyName ? null : (
          <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-sub">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-lg bg-muted text-sub"
            >
              <Building2 className="size-3.5" strokeWidth={2.5} />
            </span>
            {t('summary.scope', { count: summary.academies })}
          </p>
        )}
      </div>

      <div className="grid gap-2 px-5 pb-5 sm:grid-cols-3">
        <Tile
          count={summary.total}
          // The academy count is in the header already; a tile's second line
          // qualifies its own number, and the only thing that qualifies a
          // total of invitations is how many of them worked.
          hint={t('summary.total_hint', { count: summary.accepted })}
          icon={Send}
          label={t('summary.total')}
          // `brand`, not `primary`. `primary` is the console's attention hue,
          // and painting a neutral count with it makes an ordinary queue read
          // as an alarm — leaving nothing louder for the one number that is.
          tone="brand"
        />
        <Tile
          count={summary.pending}
          hint={t('summary.expiring_hint', { count: summary.expiringSoon })}
          hintTone={summary.expiringSoon > 0 ? 'warning' : undefined}
          icon={Hourglass}
          label={t('summary.pending')}
          tone="teal"
        />
        <Tile
          count={summary.bounced}
          hint={t(
            clear ? 'summary.bounced_clear' : 'summary.bounced_hint',
            { count: summary.bouncedLeaderless },
          )}
          hintTone={clear ? 'success' : 'danger'}
          icon={MailWarning}
          label={t('summary.bounced')}
          tone={summary.bounced > 0 ? 'danger' : 'teal'}
        />
      </div>
    </section>
  );
}

function Tile({
  count,
  hint,
  hintTone,
  icon: Icon,
  label,
  tone,
}: {
  count: number;
  hint: string;
  hintTone?: 'success' | 'warning' | 'danger';
  icon: typeof Send;
  label: string;
  tone: 'brand' | 'teal' | 'danger';
}) {
  const styles = toneStyles[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-canvas px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn('grid size-9 place-items-center rounded-lg', styles.chip)}
        >
          <Icon className="size-[1.15rem]" strokeWidth={2.25} />
        </span>
        <span>
          <span className="block font-mono text-[22px] font-extrabold leading-none tabular-nums text-ink">
            {count}
          </span>
          <span className="mt-1 block text-[12px] font-bold text-sub">
            {label}
          </span>
        </span>
      </div>
      <p
        className={cn(
          'mt-3 text-[12.5px] font-semibold',
          hintTone === 'danger' && 'text-danger',
          hintTone === 'warning' && 'text-warning',
          hintTone === 'success' && 'text-success',
          !hintTone && 'text-sub',
        )}
      >
        {hint}
      </p>
    </div>
  );
}
