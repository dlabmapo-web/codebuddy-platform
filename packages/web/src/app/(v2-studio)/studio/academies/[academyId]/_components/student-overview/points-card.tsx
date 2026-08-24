'use client';

import { formatNumber } from '@cove/i18n/format';
import type { PointsSummary } from '@cove/shared';
import { ArrowRight, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { Panel } from './student-primitives';

/**
 * Today's points, and the way to the board.
 *
 * §6.1 gives this page exactly one card about points, and this is the whole of
 * it. The overview is a starting page that answers "what should I work on
 * now"; a ranked table of eighteen classmates is the opposite of a hand-off,
 * so the ranking lives on its own page and this card is a door to it.
 *
 * Two numbers, and the second one is allowed to be missing. A class under the
 * floor, or a class where nobody has started today, has no position to print —
 * and a card that invented one would be the only place on this product where a
 * rank came from nowhere. The total stands on its own in that case, which is
 * the honest reading: the student earned what they earned whether or not
 * anyone else showed up.
 *
 * No metal, no marker, no tint. The rank markers belong to the board, where a
 * position is the subject; here it is a footnote on a link.
 */
export function PointsCard({
  academyId,
  points,
}: {
  academyId: string;
  points: PointsSummary;
}) {
  const { t } = useTranslation('learning');
  const locale = useLocale();

  return (
    <Panel icon={Trophy} title={t('points.title')} tone="brand">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 p-4">
        <p>
          <span
            className={cn(
              'block font-mono text-3xl font-semibold leading-none',
              'tracking-[-0.02em] tabular-nums text-brand',
            )}
          >
            {t('points.total', { points: formatNumber(points.points, locale) })}
          </span>
          <span className="mt-1.5 block text-[13px] text-sub">
            {points.position !== null && points.participants !== null
              ? t('points.position', {
                  position: formatNumber(points.position, locale),
                  participants: formatNumber(points.participants, locale),
                })
              : t('points.today')}
          </span>
        </p>

        <Link
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand hover:underline"
          href={`/studio/academies/${academyId}/points`}
        >
          {t('points.open')}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Panel>
  );
}
