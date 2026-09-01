'use client';

import type { PlatformUserDetail } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import { Ellipsis, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { UserAvatar } from '../../../_components/user-avatar';
import { UserRowActions } from '../../../_components/user-row-actions';
import { UserStatusChip } from '../../../_components/user-status-chip';
import {
  operatorPlateStyles,
  orderMemberships,
  roleChipStyles,
  roleTones,
  toneStyles,
  userDisplayName,
} from '../../../_lib/user-view';

/**
 * Who this account is, in one band.
 *
 * The page's one deliberately bold element, and the only place the layout
 * departs from the console's stacked-panel rhythm — everything below it is a
 * plain reading surface, which is what lets this carry weight without the page
 * becoming loud.
 *
 * The **spectrum** across the top is the signature (§8.1): a 3px band cut into
 * segments coloured by this person's memberships, in `orderMemberships` order.
 * One blue bar for an ordinary student; a split bar for somebody who is a
 * student at one academy and a team lead at another. It answers *what is this
 * account across Cove* at a glance, which nothing else on the page does, and
 * each segment is a membership the cards below expand — it is structure, not
 * decoration.
 *
 * An account in no academy gets no band. An empty grey rail would read as a
 * loading state.
 *
 * The band is `aria-hidden`: a 3px bar is decoration to a screen reader, and
 * the same memberships are listed in text directly beneath it.
 */
export function AccountHeader({
  onUpdated,
  person,
}: {
  onUpdated: () => void;
  person: PlatformUserDetail;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const memberships = orderMemberships(person.memberships);

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]">
      {memberships.length > 0 ? (
        <div aria-hidden className="flex h-1 w-full">
          {memberships.map((membership) => (
            <span
              className={cn(
                'h-full flex-1',
                toneStyles[roleTones[membership.role]].meter,
                // A membership that is no longer active is history, and history
                // should not read as loudly as what is true now.
                membership.status !== 'ACTIVE' && 'opacity-30',
              )}
              key={membership.membershipId}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4 px-5 py-5">
        <UserAvatar person={person} size="lg" />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[19px] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              {userDisplayName(person)}
            </span>
            {person.platformRole === 'ADMIN' ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide',
                  operatorPlateStyles,
                )}
              >
                <ShieldCheck className="size-3.5" strokeWidth={2.5} />
                {t('detail.operator')}
              </span>
            ) : null}
          </p>
          <p className="mt-1 truncate font-mono text-[13px] text-sub">
            {person.email ?? person.username ?? t('detail.no_email')}
          </p>

          {memberships.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {memberships.map((membership) => {
                const { icon: Icon, className } = roleChipStyles(membership.role);
                return (
                  <li key={membership.membershipId}>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold',
                        className,
                        membership.status !== 'ACTIVE' && 'opacity-60',
                      )}
                    >
                      <Icon aria-hidden className="size-3" strokeWidth={2.5} />
                      {t(`role.${membership.role}`)}
                      <span className="font-semibold opacity-80">
                        · {membership.academyName}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-sub">{t('table.no_academy')}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UserStatusChip status={person.status} />
          {/* The same menu as the directory row, so an operator who opened this
              page to suspend somebody does not have to hunt for a
              differently-shaped control. */}
          <UserRowActions
            onUpdated={onUpdated}
            person={person}
            trigger={
              <button
                aria-label={t('action.menu')}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13.5px] font-bold text-ink transition-colors hover:bg-accent data-[state=open]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                type="button"
              >
                {t('action.manage')}
                <Ellipsis className="size-4" />
              </button>
            }
          />
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 border-t border-border px-5 py-4 sm:grid-cols-4">
        <Field label={t('detail.username')}>
          {person.username ? (
            <span className="font-mono">{person.username}</span>
          ) : (
            '—'
          )}
        </Field>
        <Field label={t('detail.joined')}>
          {formatShortDate(person.createdAt, locale)}
        </Field>
        <Field label={t('detail.last_sign_in')}>
          {person.lastSignInAt
            ? formatShortDate(person.lastSignInAt, locale)
            : t('detail.never')}
        </Field>
        <Field label={t('detail.academies')}>{person.memberships.length}</Field>
      </dl>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-sub">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[14px] text-ink">{children}</dd>
    </div>
  );
}
