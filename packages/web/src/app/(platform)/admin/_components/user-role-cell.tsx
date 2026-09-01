'use client';

import type { AcademyRole, PlatformUserSummary } from '@cove/shared';
import { academyRoles } from '@cove/shared';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { cn } from '@/lib/utils';

import {
  affiliationOf,
  roleChipStyles,
  roleTones,
  toneStyles,
} from '../_lib/user-view';

/**
 * A person's role: a badge that opens a menu, exactly as it does on the
 * manager's own people table.
 *
 * The console previously buried this in the row's `⋯` menu, which made the
 * most-changed field on the page the least reachable one — and made the role a
 * label everywhere a manager reads it as a control. This is the same component
 * shape, the same coloured badge, the same radio menu, so the two surfaces
 * behave alike.
 *
 * Two differences from the manager's, both because the row is an **account**
 * rather than a membership:
 *
 * - A person may hold roles in several academies. The badge prints the lead
 *   membership's and carries `+N`; opening it lists every academy rather than
 *   offering four roles, because "change *the* role" has no meaning here and
 *   silently changing the first would be a wrong write with no error (§3.6).
 * - A selection opens the reason dialog rather than writing immediately. Every
 *   console mutation states a reason for the audit trail, and a role change
 *   reassigns classes and drops enrolments in somebody else's academy — the
 *   one place a confirmation step is worth its click.
 *
 * A row whose memberships are all inactive renders the plain badge. There is
 * nothing to press, so nothing offers to be pressed.
 */
export function UserRoleCell({
  onPick,
  onPickMany,
  person,
}: {
  /** One active membership: the chosen role, ready for the reason dialog. */
  onPick: (target: { membershipId: string; role: AcademyRole }) => void;
  /** Several: the per-academy dialog opens instead. */
  onPickMany: () => void;
  person: PlatformUserSummary;
}) {
  const { t } = useTranslation('platform-users');
  const { lead, others } = affiliationOf(person);

  if (!lead) return <span className="text-[13px] text-sub/60">—</span>;

  const { icon: Icon, className } = roleChipStyles(lead.role);
  const badge = (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold',
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{t(`role.${lead.role}`)}</span>
    </span>
  );

  const active = person.memberships.filter(
    (membership) => membership.status === 'ACTIVE',
  );
  const extra =
    others > 0 ? (
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-sub">
        +{others}
      </span>
    ) : null;

  if (active.length === 0) {
    return (
      <span className="flex items-center gap-1.5">
        {badge}
        {extra}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t('role_change.open_for', {
              role: t(`role.${lead.role}`),
            })}
            className={cn(
              'group inline-flex min-w-0 items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[12px] font-bold transition-opacity',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              className,
            )}
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <Icon aria-hidden className="size-3 shrink-0" strokeWidth={2.5} />
            <span className="truncate">{t(`role.${lead.role}`)}</span>
            {/* The only affordance the badge carries. Faint until hover, so a
                column of roles reads as values rather than as a row of
                buttons. */}
            <ChevronDown
              aria-hidden
              className="size-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100"
              strokeWidth={2.5}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-52"
          onClick={(event) => event.stopPropagation()}
        >
          {active.length === 1 ? (
            <>
              <DropdownMenuLabel>{t('table.role')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                onValueChange={(next) => {
                  if (next === active[0]!.role) return;
                  onPick({
                    membershipId: active[0]!.membershipId,
                    role: next as AcademyRole,
                  });
                }}
                value={active[0]!.role}
              >
                {academyRoles.map((role) => (
                  <DropdownMenuRadioItem className="gap-2" key={role} value={role}>
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 rounded-full',
                        toneStyles[roleTones[role]].meter,
                      )}
                    />
                    {t(`role.${role}`)}
                    {role === active[0]!.role ? (
                      <Check aria-hidden className="ml-auto size-3.5 text-brand" />
                    ) : null}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : (
            <>
              {/* Not a radio group. This account holds a role in each of
                  several academies, and they are not alternatives to one
                  another — picking one from a list of four would have to guess
                  which academy it applied to. */}
              <DropdownMenuLabel>
                {t('role_change.which_academy')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {active.map((membership) => {
                const chip = roleChipStyles(membership.role);
                return (
                  <button
                    className="flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] outline-none hover:bg-accent focus-visible:bg-accent"
                    key={membership.membershipId}
                    onClick={onPickMany}
                    type="button"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        toneStyles[roleTones[membership.role]].meter,
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {membership.academyName}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-px text-[11px] font-bold',
                        chip.className,
                      )}
                    >
                      {t(`role.${membership.role}`)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {extra}
    </span>
  );
}
