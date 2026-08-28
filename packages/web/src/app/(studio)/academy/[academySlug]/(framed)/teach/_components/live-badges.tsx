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

/**
 * A ramp, not a palette.
 *
 * This column is read vertically at speed down a class of twenty-six, so five
 * unrelated hues would slow the scan rather than help it. The tones run along
 * one axis instead — how much of the teacher's attention the row can absorb —
 * and that axis is the order `sortRoster` already puts the rows in, so colour
 * agrees with position and the eye never fights the list.
 *
 * Solving is the only state given a solid fill: it is the one where somebody
 * is typing right now, which is the row a teacher joins to help live rather
 * than to find out what happened. Peripheral vision keys on light-versus-dark
 * long before it resolves hue, so those students form a visible spine down the
 * column. Offline sits at the other end and recedes.
 *
 * Not the same thing as openable — Idle and Online rows carrying an exercise
 * are openable too. The fill tracks who is working, not what the button does.
 *
 * Reconnecting is deliberately slate rather than another amber: it is a
 * connection in doubt, not a student in doubt, and reading it as a second kind
 * of Idle would send a teacher to the wrong person.
 */
const stateTones: Record<MonitoringLiveState, string> = {
  SOLVING: 'bg-brand text-on-brand',
  IDLE: 'bg-draft-soft text-draft',
  ONLINE: 'bg-present-soft text-present',
  RECONNECTING: 'bg-unstable-soft text-unstable',
  OFFLINE: 'bg-surface text-sub',
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

/**
 * The same vocabulary as the rows below it: a connection in doubt is slate
 * here too. A page header calling reconnection amber while every row calls it
 * slate would teach a teacher that the two words mean different things.
 */
const connectionTones: Record<MonitoringConnectionState, string> = {
  connecting: 'text-sub',
  live: 'text-brand',
  reconnecting: 'text-unstable',
  resynchronizing: 'text-unstable',
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
