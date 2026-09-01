'use client';

import type { AcademyRole, DirectoryComposition } from '@cove/shared';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  operatorPlateStyles,
  roleIcons,
  roleTones,
  toneStyles,
} from '../_lib/user-view';

/**
 * Who the directory is looking at, before a single row is read.
 *
 * This replaces the lens rail. The rail was six filters wearing the costume of
 * a summary: it stated populations, but reaching one meant leaving the page
 * you were on and it duplicated the Role facet directly beneath it. What an
 * operator actually wanted from it was the *numbers* — so the numbers stay,
 * as statistics, and filtering goes back to the `+` chips where every other
 * facet already lives.
 *
 * Nothing here is a link. A count that filtered on click would be the rail
 * again with the tabs painted differently.
 *
 * ## The band
 *
 * One bar, four segments, the four academy role hues — the same device the
 * manager's control tower uses for one academy, read here at the scale of the
 * whole platform. Segments are in fixed role order rather than sorted by size:
 * a band that reordered itself as the platform grew could not be compared
 * across two visits, and the shape of the population is the thing it exists to
 * show.
 *
 * Operators are counted beside the band and never in it. `platformRole` is a
 * different axis (§3.3) — an operator may also manage an academy — so a fifth
 * segment would make the bar sum to more than the total it sits under.
 */
export function UserComposition({
  composition,
}: {
  composition: DirectoryComposition;
}) {
  const { t } = useTranslation('platform-users');

  const roles: { role: AcademyRole; count: number }[] = [
    { role: 'STUDENT', count: composition.students },
    { role: 'TEACHER', count: composition.teachers },
    { role: 'TEAM_LEAD', count: composition.teamLeads },
    { role: 'MANAGER', count: composition.managers },
  ];
  // The denominator for the band, not for the labels. An account with no
  // membership is in `total` and in no segment, so the bar is drawn against
  // what it can actually represent — otherwise it would never fill.
  const banded = roles.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section
      aria-label={t('composition.label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pb-4 pt-5">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-[30px] font-extrabold leading-none tabular-nums text-ink">
            {composition.total}
          </span>
          <span className="text-[14px] font-bold text-sub">
            {t('composition.accounts', { count: composition.total })}
          </span>
        </p>
        <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-sub">
          <span
            aria-hidden
            className={cn(
              'grid size-6 place-items-center rounded-lg',
              toneStyles.success.chip,
            )}
          >
            <Building2 className="size-3.5" strokeWidth={2.5} />
          </span>
          {t('composition.academies', { count: composition.academies })}
        </p>
      </div>

      {banded > 0 ? (
        <div
          aria-hidden
          className="mx-5 flex h-2 overflow-hidden rounded-full bg-muted"
        >
          {roles.map(({ role, count }) =>
            count > 0 ? (
              <span
                className={cn('h-full', toneStyles[roleTones[role]].meter)}
                key={role}
                // Raw share, not rounded: four rounded percentages do not add
                // to a hundred, which leaves a visible seam at the right edge.
                style={{ width: `${(count / banded) * 100}%` }}
              />
            ) : null,
          )}
        </div>
      ) : null}

      {/* Cards rather than a run of inline numbers. Six counts on one line
          read as a sentence to be parsed left to right; as cards each one is a
          figure with a label under a coloured mark, which is what makes the
          set comparable at a glance. */}
      <ul className="grid grid-cols-2 gap-2 px-5 pb-5 pt-4 sm:grid-cols-3 lg:grid-cols-6">
        {roles.map(({ role, count }) => (
          <Stat
            className={toneStyles[roleTones[role]].chip}
            count={count}
            icon={roleIcons[role]}
            key={role}
            label={t(`role.${role}`)}
          />
        ))}

        {/* Apart from the four, in the plate an operator wears everywhere else
            in the console. It is a different question from "what is this
            person in an academy", and an operator may also be a manager. */}
        <Stat
          className={operatorPlateStyles}
          count={composition.operators}
          icon={ShieldCheck}
          label={t('composition.operators')}
        />
        <Stat
          className="bg-muted text-sub"
          count={composition.total - banded}
          icon={Users}
          label={t('composition.unaffiliated')}
        />
      </ul>
    </section>
  );
}

function Stat({
  className,
  count,
  icon: Icon,
  label,
}: {
  className: string;
  count: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-border bg-canvas px-3 py-2.5">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg',
          className,
        )}
      >
        <Icon className="size-[1.15rem]" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[19px] font-extrabold leading-none tabular-nums text-ink">
          {count}
        </span>
        <span className="mt-1 block truncate text-[12px] font-bold text-sub">
          {label}
        </span>
      </span>
    </li>
  );
}
