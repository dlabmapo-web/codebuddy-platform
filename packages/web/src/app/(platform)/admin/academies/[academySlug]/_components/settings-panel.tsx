'use client';

import type { PlatformAcademyDetail } from '@cove/shared';
import { ChevronRight, Coins, Settings } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { routes } from '@/lib/routes';

/**
 * How this academy behaves, from the console.
 *
 * Two rows, both leading to console-owned pages. They were briefly shortcuts
 * that entered the academy as a Manager; they are links now, because an
 * operator changing a setting should not have to borrow somebody's role, learn
 * a rail built for them, and remember the way back.
 *
 * Below `IdentityPanel` and above the lifecycle, following the page's own
 * argument: what this academy *is*, then how it behaves, then whether it is
 * switched on at all.
 *
 * Rows rather than buttons. Nothing happens here — each one is a way onward,
 * and the chevron says so. Buttons would promise an action the panel does not
 * perform.
 *
 * The points row states the economy's state instead of disappearing with it.
 * A manager's rail hides the policy when points are off, which answers *what
 * does my academy have on*; the operator's question is *why does this academy
 * have no points*, and a row that is simply absent answers nothing at all.
 */
export function SettingsPanel({
  academy,
  pointsEnabled,
}: {
  academy: PlatformAcademyDetail;
  /** Whether this academy runs points — null when it could not be read. */
  pointsEnabled: boolean | null;
}) {
  const { t } = useTranslation('platform');

  // Archived academies are read-only everywhere else in the console, and a
  // settings page is the one place that rule would be easiest to forget.
  if (academy.status === 'ARCHIVED') return null;

  const pointsHint =
    pointsEnabled === null
      ? t('settings.points_unknown')
      : pointsEnabled
        ? t('settings.point_policy_hint')
        : t('settings.points_off');

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <h2 className="text-[15px] font-bold text-ink">{t('settings.title')}</h2>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-6 text-sub">
        {t('settings.panel_description')}
      </p>

      <div className="mt-4 grid gap-2">
        <SettingsRow
          hint={t('settings.features_hint')}
          href={routes.adminAcademySettings(academy.slug)}
          icon={<Settings className="size-[1.05rem]" />}
          label={t('settings.features')}
        />
        {/*
         * Present whether or not points are on — only its hint changes. The
         * row is how an operator reaches the switch's consequences, and it is
         * also where they read that there are none yet.
         */}
        <SettingsRow
          disabled={!pointsEnabled}
          hint={pointsHint}
          href={
            pointsEnabled
              ? routes.adminAcademyPointPolicy(academy.slug)
              : routes.adminAcademySettings(academy.slug)
          }
          icon={<Coins className="size-[1.05rem]" />}
          label={t('settings.point_policy')}
        />
      </div>
    </section>
  );
}

/**
 * `disabled` dims the glyph and the label, never the link itself.
 *
 * A row nobody can press is a dead end, and the operator reading this one has
 * a next step: the settings page, where points are switched on. So the row
 * stays reachable and sends them there instead — it is the destination that
 * changes, not whether the row works.
 */
function SettingsRow({
  disabled = false,
  hint,
  href,
  icon,
  label,
}: {
  disabled?: boolean;
  hint: string;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      className="group flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      href={href}
    >
      <span
        aria-hidden
        className={
          disabled
            ? 'grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-sub'
            : 'grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand'
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={
            disabled
              ? 'block text-[13.5px] font-bold text-sub'
              : 'block text-[13.5px] font-bold text-ink'
          }
        >
          {label}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
          {hint}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-sub transition-colors group-hover:text-brand"
      />
    </Link>
  );
}
