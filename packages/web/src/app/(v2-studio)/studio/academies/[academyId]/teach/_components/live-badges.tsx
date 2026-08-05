'use client';

import type { MonitoringLiveState } from '@cove/shared';
import {
  Circle,
  CircleDot,
  CircleDashed,
  CircleSlash,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { MonitoringConnectionState } from '@/lib/monitoring/connection';
import { cn } from '@/lib/utils';

/**
 * Presence and connection health, as text plus a shape.
 *
 * Never colour alone: the five live states have to be distinguishable to a
 * reader who cannot tell the greens from the greys, so each carries its own
 * icon and its own word.
 */

const stateIcons: Record<MonitoringLiveState, LucideIcon> = {
  SOLVING: CircleDot,
  IDLE: CircleDashed,
  ONLINE: Circle,
  RECONNECTING: LoaderCircle,
  OFFLINE: CircleSlash,
};

const stateTones: Record<MonitoringLiveState, string> = {
  SOLVING: 'bg-brand/10 text-brand',
  IDLE: 'bg-draft-soft text-draft',
  ONLINE: 'bg-canvas text-ink',
  RECONNECTING: 'bg-draft-soft text-draft',
  OFFLINE: 'bg-canvas text-sub',
};

export function LiveStateBadge({ state }: { state: MonitoringLiveState }) {
  const { t } = useTranslation('monitoring');
  const Icon = stateIcons[state];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold',
        stateTones[state],
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-3.5 shrink-0',
          // The only animated state, and it stops for a reader who asked for
          // less motion — the word alone still says what is happening.
          state === 'RECONNECTING' && 'motion-safe:animate-spin',
        )}
      />
      {t(`state.${state}`)}
    </span>
  );
}

const connectionTones: Record<MonitoringConnectionState, string> = {
  connecting: 'text-sub',
  live: 'text-brand',
  reconnecting: 'text-draft',
  resynchronizing: 'text-draft',
  degraded: 'text-danger',
  revoked: 'text-danger',
};

/**
 * The realtime service's own state, announced politely.
 *
 * `aria-live="polite"` rather than assertive: a teacher reading a student's
 * code must not have their screen reader interrupted every time a socket
 * reconnects.
 */
export function ConnectionBadge({
  state,
}: {
  state: MonitoringConnectionState;
}) {
  const { t } = useTranslation('monitoring');
  const label =
    state === 'revoked'
      ? t('connection.revoked')
      : state === 'degraded'
        ? t('connection.degraded')
        : t(`connection.${state}`);

  return (
    <span
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] font-semibold',
        connectionTones[state],
      )}
      role="status"
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full bg-current',
          state === 'live' && 'motion-safe:animate-pulse',
        )}
      />
      {label}
    </span>
  );
}
