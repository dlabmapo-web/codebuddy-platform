'use client';

import type { AuditEntry, SupportGrant } from '@cove/shared';
import { formatShortDateTime } from '@cove/i18n/format';
import { Building2, DoorOpen, Eye, PenLine, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { AuditTrail } from '@/app/(platform)/admin/audit/_components/audit-trail';
import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { Button } from '@/components/studio/button';
import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { GrantStateChip } from '../../_components/grant-state-chip';

/**
 * One support session, and what was done during it.
 *
 * The accountability payoff of the whole design: an academy asking "what did
 * you do in here" is answered by this page rather than by somebody's memory.
 */
export function GrantDetail({
  activity,
  grant: initial,
}: {
  activity: AuditEntry[];
  grant: SupportGrant;
}) {
  const [grant, setGrant] = React.useState(initial);
  const { t } = useTranslation('platform-support');
  const locale = useLocale();
  const errorText = useErrorText();

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  return (
    <div className="grid gap-4">
      <Panel icon={ShieldAlert} title={t('detail.title')}>
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              className="text-[17px] font-extrabold leading-tight text-ink hover:text-brand"
              href={routes.adminAcademy(grant.academySlug)}
            >
              {grant.academyName}
            </Link>
            <GrantStateChip state={grant.state} />
          </div>

          {/* The reason gets its own block rather than a row in the table
              below. It is the one field written by a person for another
              person, and the only one an academy will quote back. */}
          <blockquote className="mt-3 rounded-lg border-l-2 border-brand bg-muted/60 px-3.5 py-2.5 text-[14px] leading-6 text-ink">
            {grant.reason}
          </blockquote>

          <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
            <Field label={t('detail.operator')}>{grant.adminName}</Field>
            <Field label={t('detail.access')}>
              <span className="inline-flex items-center gap-1.5">
                {grant.readOnly ? (
                  <Eye className="size-3.5" />
                ) : (
                  <PenLine className="size-3.5 text-warning" />
                )}
                {grant.readOnly ? t('list.read_only') : t('list.read_write')}
                {' · '}
                {t(`role.${grant.assumedRole}`)}
              </span>
            </Field>
            <Field label={t('detail.opened')}>
              {formatShortDateTime(grant.startsAt, locale)}
            </Field>
            <Field
              label={
                grant.state === 'live' || grant.state === 'scheduled'
                  ? t('detail.expires')
                  : t('detail.expired')
              }
            >
              {formatShortDateTime(grant.expiresAt, locale)}
            </Field>
            {grant.allowMonitoring ? (
              <Field label={t('list.monitoring')}>✓</Field>
            ) : null}
            {grant.revokedAt ? (
              <Field label={t('detail.revoked')}>
                {formatShortDateTime(grant.revokedAt, locale)}
                {grant.revokedByName
                  ? ` · ${t('detail.revoked_by', { name: grant.revokedByName })}`
                  : null}
              </Field>
            ) : null}
          </dl>

          {grant.state === 'live' ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-3">
              <p className="text-[13.5px] leading-6 text-sub">
                {t('detail.revoke_hint')}
              </p>
              <div className="flex gap-2">
                <Button asChild variant="ghost">
                  <Link href={routes.academy(grant.academySlug)}>
                    <DoorOpen className="size-4" />
                    {t('detail.enter')}
                  </Link>
                </Button>
                <Button
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    setError(null);
                    try {
                      setGrant(
                        await orpc.platformSupport.revoke({
                          grantId: grant.id,
                        }),
                      );
                    } catch (caught) {
                      setError(caught);
                    } finally {
                      setPending(false);
                    }
                  }}
                  variant="danger"
                >
                  {pending ? t('detail.revoking') : t('detail.revoke')}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 text-[13px] text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel
        icon={Building2}
        meta={String(activity.length)}
        title={t('detail.activity')}
      >
        <div className="px-4 py-4">
          <p className="mb-3 text-[13px] leading-6 text-sub">
            {t('detail.activity_hint')}
          </p>
          <AuditTrail
            emptyBody={t('detail.activity_empty_body')}
            emptyTitle={t('detail.activity_empty')}
            entries={activity}
          />
        </div>
      </Panel>
    </div>
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
      <dd className="mt-0.5 text-[14px] text-ink">{children}</dd>
    </div>
  );
}
