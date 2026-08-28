'use client';

import type { AcademyScale } from '@cove/shared';
import { LayoutGrid, UserRoundX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { compositionSegments, roleIcons, roleTones } from '../../_lib/manager-view';
import { toneStyles, type PanelTone } from '../overview-ui/panel';

/**
 * The academy's population, as six cards.
 *
 * This replaces a stacked bar with four dot-labelled numbers underneath it. The
 * bar was honest but it read as decoration: three pixels tall, its segments a
 * hand's width from the numbers that explained them, and no icon to catch the
 * eye of somebody scanning past. A manager could not tell at a glance whether
 * they were looking at people or classes.
 *
 * Cards fix the two things the bar could not. Each figure now sits with its own
 * icon and its own label, so a card is legible in isolation; and the proportion
 * the bar carried survives as a share meter *inside* each role card, in that
 * role's own hue — the same hue the role wears in the people directory, on a
 * member's row, and in the recently-joined list.
 *
 * The four roles come first because they sum to the academy: a membership holds
 * exactly one role, so the shares add to a hundred and the meters are
 * comparable. Classes and suspended memberships follow behind a divider,
 * because they are counts of *other things* — a class is not a person, and a
 * suspended membership is a state rather than a role. Putting all six in one
 * undifferentiated row would invite exactly the addition that makes no sense.
 */
export function ScaleCards({ scale }: { scale: AcademyScale }) {
  const { t } = useTranslation('manager');
  const segments = compositionSegments(scale);

  return (
    <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {segments.map((segment) => (
        <StatCard
          icon={roleIcons[segment.role]}
          key={segment.role}
          label={t(`role.${segment.role}`)}
          // The share, drawn and stated. A bar alone cannot be read to two
          // figures; a percentage alone cannot be compared at a glance.
          meter={segment.percent}
          meterLabel={t('scale.share', {
            count: segment.count,
            total: scale.activeMembers,
          })}
          tone={roleTones[segment.role]}
          value={segment.count}
        />
      ))}

      <StatCard
        caption={
          scale.archivedClasses > 0
            ? t('scale.archived_classes', { count: scale.archivedClasses })
            : undefined
        }
        icon={LayoutGrid}
        label={t('scale.active_classes')}
        tone="peer"
        value={scale.activeClasses}
      />

      <StatCard
        caption={t('scale.suspended_caption')}
        icon={UserRoundX}
        label={t('scale.suspended')}
        // Warning rather than danger: a suspension is a reversible decision
        // somebody made on purpose, not a fault. Red here would read as an
        // error in the academy's own summary.
        tone={scale.suspendedMembers > 0 ? 'warning' : 'muted'}
        value={scale.suspendedMembers}
      />
    </div>
  );
}

/**
 * One figure, with the icon that says what it counts.
 *
 * `muted` exists for a zero that is good news. A suspended count of nought
 * painted amber would be an academy permanently flagging its own health, so the
 * card recedes to the page's neutral until there is something to report — the
 * number stays, because "0 suspended" is an answer and a missing card is not.
 */
function StatCard({
  caption,
  icon: Icon,
  label,
  meter,
  meterLabel,
  tone,
  value,
}: {
  caption?: string;
  icon: LucideIcon;
  label: string;
  meter?: number;
  meterLabel?: string;
  tone: PanelTone | 'muted';
  value: number;
}) {
  const styles = tone === 'muted' ? null : toneStyles[tone];

  return (
    <div className="flex flex-col gap-2.5 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span
          aria-hidden
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            styles ? styles.chip : 'bg-accent text-sub',
          )}
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="font-mono text-[26px] font-extrabold leading-none tabular-nums">
          {value}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-bold">{label}</p>
        {meter !== undefined ? (
          <>
            <span
              aria-hidden
              className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-accent"
            >
              <span
                className={cn(
                  'block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
                  styles?.meter,
                )}
                style={{ width: `${meter}%` }}
              />
            </span>
            <p className="mt-1.5 text-[11px] text-sub">{meterLabel}</p>
          </>
        ) : caption ? (
          <p className="mt-1 text-[11px] leading-[1.45] text-sub">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}
