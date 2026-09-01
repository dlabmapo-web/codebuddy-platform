'use client';

import type {
  MembershipParticipation,
  PlatformUserMembership,
} from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { isAccessDeniedError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import {
  roleChipStyles,
  roleTones,
  toneStyles,
} from '../../../_lib/user-view';
import { ParticipationBody } from './participation-body';

/**
 * One academy this person belongs to, and what they do there.
 *
 * The head is identical whatever the role — icon, academy, role chip,
 * membership status, joined date — and only the body differs. That is the
 * whole reason `MembershipParticipation` carries four nullable branches rather
 * than being a discriminated union (§5.3): one card, one switch, no header
 * repeated four times.
 *
 * The body is fetched on first expand and never with the page. `get` renders
 * this header and must stay one cheap read, and the audit row a student's card
 * writes (§3.5) has to mean *somebody looked at this* — which it cannot if it
 * fires on every page load.
 *
 * A suspended membership still opens. History is usually what an operator is
 * here for, and the status chip in the head already says it is history.
 */
export function MembershipCard({
  defaultOpen,
  membership,
  userId,
}: {
  defaultOpen: boolean;
  membership: PlatformUserMembership;
  userId: string;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const [open, setOpen] = React.useState(defaultOpen);
  const tone = toneStyles[roleTones[membership.role]];
  const { icon: Icon, className: chip } = roleChipStyles(membership.role);
  const bodyId = `membership-${membership.membershipId}`;

  const participation = useQuery<MembershipParticipation>({
    queryKey: ['platform-participation', membership.membershipId],
    queryFn: () =>
      orpc.platformUsers.participation({
        userId,
        membershipId: membership.membershipId,
      }),
    // Fetched on first expand, then kept: reopening a card an operator has
    // already looked at is not a second look, and should not write a second
    // audit row or a second round of queries.
    enabled: open,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]">
      <div aria-hidden className={cn('h-1 w-full', tone.rail)} />

      <h3>
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl',
              tone.chip,
            )}
          >
            <Icon className="size-[1.15rem]" strokeWidth={2.25} />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold tracking-[-0.01em] text-ink">
              {membership.academyName}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-sub">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                  chip,
                )}
              >
                {t(`role.${membership.role}`)}
              </span>
              <span
                className={
                  membership.status === 'ACTIVE'
                    ? 'text-sub'
                    : 'font-bold text-danger'
                }
              >
                {t(`membership_status.${membership.status}`)}
              </span>
              {membership.joinedAt ? (
                <span>{formatShortDate(membership.joinedAt, locale)}</span>
              ) : null}
            </span>
          </span>

          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-sub transition-transform duration-150 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>

      {open ? (
        <div className="border-t border-border" id={bodyId}>
          <CardBody
            error={participation.error}
            loading={participation.isPending}
            membership={membership}
            onRetry={() => void participation.refetch()}
            participation={participation.data}
          />
        </div>
      ) : null}
    </section>
  );
}

function CardBody({
  error,
  loading,
  membership,
  onRetry,
  participation,
}: {
  error: unknown;
  loading: boolean;
  membership: PlatformUserMembership;
  onRetry: () => void;
  participation: MembershipParticipation | undefined;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();

  if (loading) {
    // A skeleton at roughly the card's own height, so expanding does not jump
    // the page under the reader's cursor.
    return (
      <div aria-busy className="grid gap-2.5 p-4">
        <span className="sr-only">{t('participation.loading')}</span>
        <span className="h-20 animate-pulse rounded-lg bg-muted" />
        <span className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        <span className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    // A permission answer, not a failure. An operator without the
    // participation permission should be told which permission, not shown a
    // retry button that will never work.
    const denied = isAccessDeniedError(error);
    return (
      <div className="p-4">
        <p
          className={cn(
            'text-[13.5px] leading-6',
            denied ? 'text-sub' : 'text-danger',
          )}
          role={denied ? undefined : 'alert'}
        >
          {denied ? t('participation.forbidden') : errorText(error)}
        </p>
        {denied ? null : (
          <button
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90"
            onClick={onRetry}
            type="button"
          >
            {t('participation.retry')}
          </button>
        )}
      </div>
    );
  }

  if (!participation) return null;

  return (
    <>
      <ParticipationBody participation={participation} />
      <div className="border-t border-border px-4 py-3">
        <Link
          className="text-[13px] font-bold text-brand hover:underline"
          href={routes.adminAcademy(membership.academySlug)}
        >
          {t('participation.open_academy')}
        </Link>
      </div>
    </>
  );
}
