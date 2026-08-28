'use client';

import type { ClassStatus } from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Status carries a dot *and* a word. Colour alone would leave the one piece of
 * state that decides whether a class grants access invisible to a reader who
 * cannot separate the two tones.
 */
export function ClassStatusBadge({
  className,
  status,
}: {
  className?: string;
  status: ClassStatus;
}) {
  const { t } = useLayoutTranslation('classes');
  const active = status === 'ACTIVE';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold',
        active ? 'bg-success/10 text-success' : 'bg-retired-soft text-retired',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          active ? 'bg-success' : 'bg-retired',
        )}
      />
      {t(`status.${status}`)}
    </span>
  );
}
