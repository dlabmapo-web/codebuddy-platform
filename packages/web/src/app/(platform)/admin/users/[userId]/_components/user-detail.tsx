'use client';

import type { PlatformUserDetail } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import { Building2, MailWarning, ShieldCheck, UserCog } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  EmptyState,
  Panel,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { UserAvatar } from '../../../_components/user-avatar';
import { UserStatusChip } from '../../../_components/user-status-chip';
import { orderMemberships, userDisplayName } from '../../../_lib/user-view';

const body = 'px-4 py-4';

/**
 * One account, from the platform's side.
 *
 * Four panels, and deliberately no fifth. Identity, where they belong, what was
 * sent to them, and what they asked for. There is no learning section: no
 * submission, no progress, no points, and no student profile — those belong to
 * the academy that holds them, and an operator who needs one opens a support
 * grant that states a reason and expires.
 *
 * The panels are the product's own, as the academy detail page's are, so an
 * operator moving between the two reads one product rather than two.
 */
export function UserDetail({
  person: initial,
}: {
  person: PlatformUserDetail;
}) {
  const [person, setPerson] = React.useState(initial);

  return (
    <div className="grid gap-4">
      <IdentityPanel onChange={setPerson} person={person} />
      <MembershipsPanel person={person} />
      <InvitationsPanel person={person} />
      <JoinRequestsPanel person={person} />
    </div>
  );
}

/* --------------------------------------------------------------- identity */

function IdentityPanel({
  person,
  onChange,
}: {
  person: PlatformUserDetail;
  onChange: (next: PlatformUserDetail) => void;
}) {
  const { t } = useTranslation('platform-users');
  // "Never" is the console's word, shared with the academy pages.
  const { t: console_ } = useTranslation('platform');
  const locale = useLocale();

  return (
    <Panel icon={UserCog} title={t('detail.identity')}>
      <div className={body}>
        <div className="flex flex-wrap items-center gap-4">
          <UserAvatar person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[17px] font-extrabold leading-tight text-ink">
              <span className="truncate">{userDisplayName(person)}</span>
              {person.platformRole === 'ADMIN' ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-[12px] font-bold text-brand">
                  <ShieldCheck className="size-3.5" />
                  {t('detail.operator')}
                </span>
              ) : null}
            </p>
            <p className="mt-1 truncate font-mono text-[13px] text-sub">
              {person.email ?? t('detail.no_email')}
            </p>
          </div>
          <UserStatusChip status={person.status} />
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-2">
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
              : console_('never')}
          </Field>
          <Field label={t('detail.academies')}>
            {person.memberships.length}
          </Field>
        </dl>

        <StatusControl onChange={onChange} person={person} />
      </div>
    </Panel>
  );
}

/**
 * Suspend or restore, with a reason.
 *
 * The same shape as the academy lifecycle control one folder over — a confirm
 * dialog whose submit stays disabled until a reason is written — because it is
 * the same kind of decision at a different scale, and an operator should not
 * have to learn it twice.
 *
 * The API refuses two cases this control cannot know about: suspending
 * yourself, and suspending the last active manager of a running academy. Both
 * come back as an error message rather than being predicted here, because both
 * depend on state this page does not hold.
 */
function StatusControl({
  person,
  onChange,
}: {
  person: PlatformUserDetail;
  onChange: (next: PlatformUserDetail) => void;
}) {
  const { t } = useTranslation('platform-users');
  // The confirm dialog's reason field and its two buttons are the console's
  // shared vocabulary, not this page's — the academy lifecycle control uses
  // exactly the same words, and two spellings of "Reason" in one console is
  // worse than one extra namespace on one component.
  const { t: console_ } = useTranslation('platform');
  const errorText = useErrorText();

  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const target = person.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
  // An account still finishing signup is not a candidate for either action:
  // restoring it would claim it is done, suspending it punishes somebody for
  // not having filled a form in yet.
  if (person.status === 'PENDING_PROFILE' || person.status === 'DELETED') {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/60 px-3.5 py-3">
      <p className="text-[13.5px] leading-6 text-sub">
        {target === 'SUSPENDED'
          ? t('detail.suspend_hint')
          : t('detail.restore_hint')}
      </p>
      <Button
        onClick={() => {
          setReason('');
          setError(null);
          setOpen(true);
        }}
        variant={target === 'SUSPENDED' ? 'danger' : 'default'}
      >
        {target === 'SUSPENDED'
          ? t('detail.suspend')
          : t('detail.restore')}
      </Button>

      <Modal onOpenChange={setOpen} open={open}>
        <ModalContent
          description={
            target === 'SUSPENDED'
              ? t('detail.confirm_suspend_body')
              : t('detail.confirm_restore_body')
          }
          title={
            target === 'SUSPENDED'
              ? t('detail.confirm_suspend_title', {
                  name: userDisplayName(person),
                })
              : t('detail.confirm_restore_title', {
                  name: userDisplayName(person),
                })
          }
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError(null);
              try {
                const next = await orpc.platformUsers.setStatus({
                  userId: person.userId,
                  status: target,
                  reason: reason.trim(),
                });
                onChange(next);
                setOpen(false);
              } catch (caught) {
                setError(caught);
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="grid gap-1.5 px-6 py-5">
              <label
                className="text-[13.5px] font-bold text-ink"
                htmlFor="person-status-reason"
              >
                {console_('detail.reason_label')}
                <span className="ml-1 text-danger">*</span>
              </label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                id="person-status-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
              <p className="text-[12.5px] text-sub">{console_('detail.reason_hint')}</p>
              {error ? (
                <p className="mt-1 text-[13px] text-danger" role="alert">
                  {errorText(error)}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                disabled={pending}
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {console_('create.cancel')}
              </Button>
              <Button
                disabled={pending || reason.trim().length < 8}
                type="submit"
                variant={target === 'SUSPENDED' ? 'danger' : 'default'}
              >
                {pending ? console_('detail.working') : console_('detail.confirm')}
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------ memberships */

function MembershipsPanel({ person }: { person: PlatformUserDetail }) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const memberships = orderMemberships(person.memberships);

  return (
    <Panel
      icon={Building2}
      meta={String(memberships.length)}
      title={t('detail.memberships')}
    >
      {memberships.length === 0 ? (
        <EmptyState
          body={t('detail.memberships_empty_body')}
          title={t('detail.memberships_empty')}
        />
      ) : (
        <ul className="divide-y divide-border">
          {memberships.map((membership) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={membership.academyId}
            >
              <div className="min-w-0">
                <Link
                  className="truncate text-[14px] font-bold text-ink hover:text-brand"
                  href={routes.adminAcademy(membership.academySlug)}
                >
                  {membership.academyName}
                </Link>
                <p className="text-[12.5px] text-sub">
                  {t(`role.${membership.role}`)}
                  {membership.joinedAt
                    ? ` · ${formatShortDate(membership.joinedAt, locale)}`
                    : null}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-bold ${
                  membership.status === 'ACTIVE'
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {t(`membership_status.${membership.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
    >
      {person.invitations.length === 0 ? (
        <EmptyState
          body={t('detail.invitations_empty_body')}
          title={t('detail.invitations_empty')}
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
                    {t(
                      `delivery.${invitation.lastDelivery.state}`,
                    )}
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
    >
      {person.joinRequests.length === 0 ? (
        <EmptyState
          body={t('detail.join_requests_empty_body')}
          title={t('detail.join_requests_empty')}
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
