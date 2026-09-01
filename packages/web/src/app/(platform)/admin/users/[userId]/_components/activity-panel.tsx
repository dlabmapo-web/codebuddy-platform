'use client';

import type { AuditEntry, PlatformUserDetail } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  Panel,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { isAccessDeniedError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';

import { auditPath } from '../../../_lib/audit-query';

import { AuditTrail } from '../../../audit/_components/audit-trail';

const SHOWN = 10;

/**
 * What was done to this account, and what it did.
 *
 * Two reads rather than one. An act *upon* this account is keyed on the user
 * id — or on one of its memberships, since a role change is written against
 * the membership — while an act *by* it is keyed on the actor. The audit
 * service ANDs its filters, so one call cannot ask both questions, and merging
 * the newest page of each gives the true newest of the union.
 *
 * Capped at ten, with the full trail one link away. This panel exists to say
 * *something happened here recently*; an operator following it further belongs
 * on the audit page, which pages and filters properly.
 */
export function ActivityPanel({ person }: { person: PlatformUserDetail }) {
  const { t } = useTranslation('platform-users');

  const targetIds = React.useMemo(
    () => [
      person.userId,
      ...person.memberships.map((membership) => membership.membershipId),
    ],
    [person.memberships, person.userId],
  );

  const upon = useQuery({
    queryKey: ['platform-audit', 'upon', person.userId, targetIds.length],
    queryFn: () =>
      orpc.platformAudit.list({ targetIds, page: 1, pageSize: SHOWN }),
    retry: false,
    staleTime: 30_000,
  });
  const by = useQuery({
    queryKey: ['platform-audit', 'by', person.userId],
    queryFn: () =>
      orpc.platformAudit.list({
        actorUserId: person.userId,
        page: 1,
        pageSize: SHOWN,
      }),
    retry: false,
    staleTime: 30_000,
  });

  const denied =
    isAccessDeniedError(upon.error) || isAccessDeniedError(by.error);
  const failed = Boolean(upon.error || by.error) && !denied;

  const entries = React.useMemo(() => {
    const seen = new Map<string, AuditEntry>();
    for (const entry of [
      ...(upon.data?.entries ?? []),
      ...(by.data?.entries ?? []),
    ]) {
      // An operator acting on their own account appears in both reads.
      seen.set(entry.id, entry);
    }
    return [...seen.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, SHOWN);
  }, [by.data?.entries, upon.data?.entries]);

  return (
    <Panel
      actions={
        <Link
          className="text-[13px] font-bold text-brand hover:underline"
          href={auditPath({ targetIds })}
        >
          {t('activity.open_trail')}
        </Link>
      }
      icon={ScrollText}
      title={t('activity.title')}
      tone="warning"
    >
      <div className="p-4">
        {upon.isPending || by.isPending ? (
          <div aria-busy className="grid gap-2">
            <span className="sr-only">{t('activity.loading')}</span>
            <span className="h-14 animate-pulse rounded-card bg-muted" />
            <span className="h-14 animate-pulse rounded-card bg-muted" />
          </div>
        ) : denied ? (
          <p className="text-[13.5px] leading-6 text-sub">
            {t('activity.forbidden')}
          </p>
        ) : failed ? (
          <p className="text-[13.5px] leading-6 text-danger" role="alert">
            {t('activity.failed')}
          </p>
        ) : entries.length === 0 ? (
          <EmptyState
            body={t('activity.empty_body')}
            icon={ScrollText}
            title={t('activity.empty')}
            tone="warning"
          />
        ) : (
          <AuditTrail
            emptyBody={t('activity.empty_body')}
            emptyTitle={t('activity.empty')}
            entries={entries}
          />
        )}
      </div>
    </Panel>
  );
}
