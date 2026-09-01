'use client';

import type { PlatformUserDetail } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import { useQuery } from '@tanstack/react-query';
import { Building2, MailWarning } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  Panel,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { orderMemberships } from '../../../_lib/user-view';
import { AccountHeader } from './account-header';
import { ActivityPanel } from './activity-panel';
import { MembershipCard } from './membership-card';

/**
 * One account, from the platform's side.
 *
 * The page is read top to bottom as one question narrowing: *who is this*
 * (header), *where do they belong and what do they do there* (the cards),
 * *what was sent to them and what did they ask for* (invitations and
 * applications), *what has happened here* (activity).
 *
 * The learning section the first console design ruled out is here now, inside
 * the membership cards, and it is not the same thing that was ruled out. §3.4
 * of the console people operations design moves the line to structure and
 * totals: which classes, which courses, how much solved, how much time. No
 * guardian detail, no submitted code, no feedback text — those stay behind a
 * support grant, they are gated on their own permission, and reading a
 * student's card is audited on the academy's own trail (§3.5).
 *
 * The suspend control that used to live at the bottom of the identity panel is
 * gone from here: it is in the header menu, which is the same menu the
 * directory row carries. A destructive action wedged into the bottom of an
 * information panel is findable exactly once, by the person who built it.
 */
export function UserDetail({
  person: initial,
}: {
  person: PlatformUserDetail;
}) {
  const router = useRouter();
  const { t } = useTranslation('platform-users');

  const query = useQuery({
    queryKey: ['platform-user', initial.userId],
    queryFn: () => orpc.platformUsers.get({ userId: initial.userId }),
    initialData: initial,
    staleTime: 30_000,
    retry: false,
  });
  const person = query.data;

  const onUpdated = React.useCallback(() => {
    void query.refetch();
    // The shell above renders the person's name, and the directory behind this
    // page renders their status. Both are server-rendered.
    router.refresh();
  }, [query, router]);

  const memberships = orderMemberships(person.memberships);

  return (
    <div className="grid gap-4">
      <AccountHeader onUpdated={onUpdated} person={person} />

      {memberships.length === 0 ? (
        <Panel
          icon={Building2}
          title={t('detail.memberships')}
          tone="brand"
        >
          <EmptyState
            body={t('detail.memberships_empty_body')}
            icon={Building2}
            title={t('detail.memberships_empty')}
            tone="brand"
          />
        </Panel>
      ) : (
        <div className="grid gap-3">
          {memberships.map((membership, index) => (
            <MembershipCard
              // The lead membership opens on arrival — it is the one the
              // directory row was showing, so it is the one the operator
              // clicked through to read. The rest cost a deliberate click,
              // which is also what makes their audit rows mean something.
              defaultOpen={index === 0}
              key={membership.membershipId}
              membership={membership}
              userId={person.userId}
            />
          ))}
        </div>
      )}

      <InvitationsPanel person={person} />
      <JoinRequestsPanel person={person} />
      <ActivityPanel person={person} />
    </div>
  );
}

/* ------------------------------------------------------------ invitations */

function InvitationsPanel({ person }: { person: PlatformUserDetail }) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();

  return (
    <Panel
      icon={MailWarning}
      meta={String(person.invitations.length)}
      title={t('detail.invitations')}
      tone="teal"
    >
      {person.invitations.length === 0 ? (
        <EmptyState
          body={t('detail.invitations_empty_body')}
          icon={MailWarning}
          title={t('detail.invitations_empty')}
          tone="teal"
        />
      ) : (
        <ul className="divide-y divide-border">
          {person.invitations.map((invitation) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={invitation.id}
            >
              <div className="min-w-0">
                <Link
                  className="truncate text-[14px] font-bold text-ink hover:text-brand"
                  href={routes.adminAcademy(invitation.academySlug)}
                >
                  {invitation.academyName}
                </Link>
                <p className="text-[12.5px] text-sub">
                  {t(`role.${invitation.role}`)}
                  {' · '}
                  {formatShortDate(invitation.createdAt, locale)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[12.5px] font-bold text-sub">
                  {t(`invitation_status.${invitation.status}`)}
                </span>
                {/* The reason this panel exists. "It never arrived" is the
                    single most common support message about an invitation, and
                    the provider already answered it. */}
                {invitation.lastDelivery ? (
                  <span
                    className={`text-[12px] ${
                      invitation.lastDelivery.state === 'BOUNCED' ||
                      invitation.lastDelivery.state === 'FAILED'
                        ? 'font-bold text-danger'
                        : 'text-sub'
                    }`}
                  >
                    {t(`delivery.${invitation.lastDelivery.state}`)}
                    {invitation.lastDelivery.failureCode
                      ? ` · ${invitation.lastDelivery.failureCode}`
                      : null}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------- join requests */

function JoinRequestsPanel({ person }: { person: PlatformUserDetail }) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();

  return (
    <Panel
      icon={Building2}
      meta={String(person.joinRequests.length)}
      title={t('detail.join_requests')}
      tone="peer"
    >
      {person.joinRequests.length === 0 ? (
        <EmptyState
          body={t('detail.join_requests_empty_body')}
          icon={Building2}
          title={t('detail.join_requests_empty')}
          tone="peer"
        />
      ) : (
        <ul className="divide-y divide-border">
          {person.joinRequests.map((request) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={request.id}
            >
              <div className="min-w-0">
                <Link
                  className="truncate text-[14px] font-bold text-ink hover:text-brand"
                  href={routes.adminAcademy(request.academySlug)}
                >
                  {request.academyName}
                </Link>
                <p className="text-[12.5px] text-sub">
                  {formatShortDate(request.createdAt, locale)}
                  {request.approvedRole
                    ? ` · ${t(`role.${request.approvedRole}`)}`
                    : null}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] font-bold text-sub">
                {t(`join_request_status.${request.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
