'use client';

import type { StudentIndicatorState } from '@cove/shared';
import { Eye, Hand, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/**
 * What a student is told while a teacher is present.
 *
 * Generic by design: monitoring, helping, or reconnecting, and never a name.
 * The teacher's identity is recorded on the visit for accountability and is
 * deliberately absent from everything the student's browser receives.
 */
export function MonitoringIndicator({
  state,
}: {
  state: StudentIndicatorState;
}) {
  const { t } = useTranslation('monitoring');
  if (state === 'NONE') return null;

  const Icon =
    state === 'HELPING' ? Hand : state === 'RECONNECTING' ? LoaderCircle : Eye;

  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold',
        state === 'HELPING'
          ? 'bg-brand/10 text-brand'
          : 'bg-draft-soft text-draft',
      )}
      role="status"
    >
      <Icon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          state === 'RECONNECTING' && 'motion-safe:animate-spin',
        )}
      />
      {state === 'HELPING'
        ? t('indicator.helping')
        : state === 'RECONNECTING'
          ? t('indicator.reconnecting')
          : t('indicator.monitoring')}
    </span>
  );
}
