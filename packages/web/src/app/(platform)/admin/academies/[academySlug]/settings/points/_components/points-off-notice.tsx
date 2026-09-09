'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * This academy does not run points, and the policy below applies to nobody yet.
 *
 * Not a warning, and deliberately not in the danger or draft tone. Points being
 * off is an ordinary configuration an academy chose — the operator came here to
 * find out that it is off, so the page states it plainly and shows the way to
 * the switch. Colouring it as a problem would tell every academy that does not
 * run an economy that something is wrong with them.
 */
export function PointsOffNotice({ href }: { href: string }) {
  const { t } = useTranslation('platform');

  return (
    <div className="mb-5 flex items-start gap-3 rounded-card border border-border bg-accent px-4 py-3.5">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-sub" />
      <p className="text-[13px] leading-6 text-sub">
        {t('settings.points_off_notice')}{' '}
        <Link className="font-bold text-brand hover:underline" href={href}>
          {t('settings.points_off_action')}
        </Link>
      </p>
    </div>
  );
}
