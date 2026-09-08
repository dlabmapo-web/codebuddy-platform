'use client';

import { Coins } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * The step from "points are on" to "and this is what they pay".
 *
 * A row rather than a button: it is a way onward from a settings list, not an
 * action on this page, and the two should not look alike. It takes the same
 * glyph the policy wears in the studio rail and on the academy's own page, so
 * the operator meets one icon for one subject wherever they are.
 */
export function PointPolicyLink({ href }: { href: string }) {
  const { t } = useTranslation('platform');

  return (
    <Link
      className="mt-5 flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5 outline-none transition-colors hover:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      href={href}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
      >
        <Coins className="size-[1.05rem]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-ink">
          {t('settings.point_policy')}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
          {t('settings.point_policy_hint')}
        </span>
      </span>
    </Link>
  );
}
