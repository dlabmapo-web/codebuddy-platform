'use client';

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { academyCondition, conditionStyles } from '../_lib/platform-view';
import type { AcademyCondition } from '../_lib/platform-view';

/**
 * What state an academy is in, as a dot and a word.
 *
 * The same shape as `ClassStatusBadge` and for the same reason: colour alone
 * would leave the one fact that decides whether anybody can sign in invisible
 * to a reader who cannot separate the tones.
 *
 * It reports the *condition* — status and manager state resolved together —
 * because "Active" is a misleading answer for an academy that is running with
 * nobody in charge of it.
 */
export function AcademyStateBadge({
  academy,
  className,
}: {
  academy: Parameters<typeof academyCondition>[0];
  className?: string;
}) {
  const { t } = useTranslation('platform');
  const condition = academyCondition(academy);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold',
        conditionStyles[condition].chip,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', conditionStyles[condition].dot)}
      />
      {t(`condition.${condition}` as ConditionKey)}
    </span>
  );
}

type ConditionKey = `condition.${AcademyCondition}`;
