'use client';

import type { AcademyStatus, PlatformAcademyDetail } from '@cove/shared';
import { canTransitionAcademyStatus } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import {
  DoorOpen,
  MailWarning,
  Power,
  School,
  ScrollText,
  Send,
  UserRoundPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

import { AcademyVitals } from './academy-vitals';
import { IdentityPanel } from './identity-panel';
import { cn } from '@/lib/utils';

import { InvitationLink } from '../../../_components/invitation-link';

/** Every panel body supplies its own padding, as the manager's panels do. */
const body = 'px-4 py-4';

/**
 * One academy, from the outside.
 *
 * Four panels in the order an operator needs them: who is supposed to be
 * running it, who is in it, what it is, and whether it is switched on. They are
 * the product's own panels — same rail, same icon chip, same `meta`
 * denominator — because this page answers the same kind of question the
 * manager's control tower does, one level up.
 *
 * The vitals strip above them is this page's own addition: an operator opening
 * an academy is usually asking whether it is working, and the member counts
 * alone cannot tell a thriving campus from forty students with no class and no
 * published course.
 *
 * Counts and links only — no course, class, or member is listed here. Reading
 * one is a click into the console's own directories, or into the academy
 * itself, where the operator's standing read applies and every change still
 * needs a session.
 */
export function AcademyDetail({
  academy: initial,
}: {
  academy: PlatformAcademyDetail;
}) {
  const [academy, setAcademy] = React.useState(initial);

  return (
    <div className="grid gap-6">
      {/* What the academy *is doing*, first. Everything below it is
          administration, and an operator opening this page is almost always
          asking the question these four numbers answer. */}
      <AcademyVitals academy={academy} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="grid content-start gap-6">
        <FirstManagerPanel academy={academy} onChange={setAcademy} />
        <IdentityPanel academy={academy} onChange={setAcademy} />
      </div>
      <div className="grid content-start gap-6">
        <EnterAcademyPanel academy={academy} />
        <LifecyclePanel academy={academy} onChange={setAcademy} />
        <DetailsPanel academy={academy} />
      </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- people */

/* ---------------------------------------------------------------- details */

function DetailsPanel({ academy }: { academy: PlatformAcademyDetail }) {
  const { t } = useTranslation('platform');
  const locale = useLocale();

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: t('detail.organization'), value: academy.organization.name },
    {
      label: t('detail.time_zone'),
      value: <span className="font-mono text-[13px]">{academy.timeZone}</span>,
    },
    {
      label: t('detail.created'),
      value: formatShortDate(academy.createdAt, locale),
    },
    {
      label: t('detail.created_by'),
      value: academy.createdBy?.displayName ?? academy.createdBy?.email ?? '—',
    },
    { label: t('detail.contact'), value: academy.contactEmail ?? '—' },
  ];

  return (
    <Panel icon={School} title={t('detail.details')} tone="brand">
      <dl className={cn('grid gap-2.5', body)}>
        {rows.map((row) => (
          <div
            className="flex items-baseline justify-between gap-4"
            key={row.label}
          >
            <dt className="text-[13px] text-sub">{row.label}</dt>
            <dd className="text-right text-[13.5px] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* --------------------------------------------------------- first manager */

function FirstManagerPanel({
  academy,
  onChange,
}: {
  academy: PlatformAcademyDetail;
  onChange: (next: PlatformAcademyDetail) => void;
}) {
  const { t } = useTranslation('platform');
  const locale = useLocale();
  const errorText = useErrorText();
  const router = useRouter();

  const [email, setEmail] = React.useState(
    academy.pendingManagerInvitation?.email ?? '',
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [sent, setSent] = React.useState<{ email: string; token: string } | null>(
    null,
  );

  // Nothing to do once somebody is running the academy. The panel disappears
  // rather than offering an action the API would refuse.
  if (academy.managerState === 'active') return null;

  const invitation = academy.pendingManagerInvitation;

  return (
    <Panel
      description={t('detail.resend_body')}
      icon={UserRoundPlus}
      title={t('detail.manager_invitation')}
      tone={academy.managerState === 'no_active_manager' ? 'danger' : 'primary'}
    >
      <div className={body}>
        {invitation ? (
          <p
            className={cn(
              'mb-3 flex items-center gap-1.5 text-[13.5px]',
              invitation.isExpired ? 'text-warning' : 'text-sub',
            )}
          >
            {invitation.isExpired ? (
              <MailWarning aria-hidden className="size-4 shrink-0" />
            ) : null}
            {t(
              invitation.isExpired
                ? 'detail.invitation_expired'
                : 'detail.invitation_pending',
              {
                email: invitation.email,
                when: formatShortDate(invitation.expiresAt, locale),
              },
            )}
          </p>
        ) : null}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || email.trim().length < 4) return;
            setPending(true);
            setError(null);
            try {
              const result =
                await orpc.platformAcademies.resendFirstManagerInvitation({
                  academyId: academy.id,
                  email: email.trim(),
                });
              setSent({ email: result.invitation.email, token: result.token });
              onChange({
                ...academy,
                pendingManagerInvitation: {
                  email: result.invitation.email,
                  expiresAt: result.invitation.expiresAt,
                  isExpired: false,
                },
              });
              router.refresh();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          <label className="grid flex-1 gap-1.5">
            <span className="text-[12.5px] font-bold text-ink">
              {t('detail.resend_email_label')}
            </span>
            <input
              autoComplete="off"
              className="h-10 w-full min-w-48 rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <Button disabled={pending} type="submit">
            <Send aria-hidden className="size-4" />
            {pending ? t('detail.resend_sending') : t('detail.resend_submit')}
          </Button>
        </form>

        {sent ? (
          <div className="mt-3">
            <p className="text-[13px] text-success" role="status">
              {t('detail.resend_done', { email: sent.email })}
            </p>
            <div className="mt-2">
              <InvitationLink academyId={academy.id} token={sent.token} />
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
  );
}

/* -------------------------------------------------------------- lifecycle */

/**
 * The way in.
 *
 * Deliberately a link to a form rather than a button that opens a session.
 * Entering a customer's academy takes a written reason and three decisions
 * about how much authority to take, and none of that fits behind one click —
 * nor should it, because the friction is the feature.
 *
 * Absent for an archived academy: there is nothing running to support, and the
 * only grant that would be allowed there is read-only, which the operator can
 * still open from the support console if they genuinely need the history.
 */
function EnterAcademyPanel({ academy }: { academy: PlatformAcademyDetail }) {
  const { t } = useTranslation('platform-support');

  if (academy.status === 'ARCHIVED') return null;

  return (
    <Panel icon={DoorOpen} title={t('title')}>
      <div className={cn(body, 'flex flex-wrap items-center justify-between gap-3')}>
        <p className="max-w-prose text-[13.5px] leading-6 text-sub">
          {t('open.subtitle')}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Before going in, what previous sessions did. An operator about to
              open one is exactly the person who should see the last. */}
          <Button asChild variant="ghost">
            <Link href={`/admin/audit?academy=${academy.id}`}>
              <ScrollText className="size-4" />
              {t('detail.activity')}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/access/new?academy=${academy.id}`}>
              <DoorOpen className="size-4" />
              {t('open.cta')}
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function LifecyclePanel({
  academy,
  onChange,
}: {
  academy: PlatformAcademyDetail;
  onChange: (next: PlatformAcademyDetail) => void;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const router = useRouter();

  const [target, setTarget] = React.useState<AcademyStatus | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const transitions = (['SUSPENDED', 'ACTIVE', 'ARCHIVED'] as const).filter(
    (next) => canTransitionAcademyStatus(academy.status, next),
  );

  const labels: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.restore'),
    SUSPENDED: t('detail.suspend'),
    ARCHIVED: t('detail.archive'),
  };
  const titles: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.confirm_restore_title', { name: academy.name }),
    SUSPENDED: t('detail.confirm_suspend_title', { name: academy.name }),
    ARCHIVED: t('detail.confirm_archive_title', { name: academy.name }),
  };
  const bodies: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.confirm_restore_body'),
    SUSPENDED: t('detail.confirm_suspend_body'),
    ARCHIVED: t('detail.confirm_archive_body'),
  };

  return (
    <Panel icon={Power} title={t('detail.lifecycle')} tone="warning">
      <div className={body}>
        <p className="text-[13.5px] leading-relaxed text-sub">
          {t(
            academy.status === 'ACTIVE'
              ? 'detail.lifecycle_active'
              : academy.status === 'SUSPENDED'
                ? 'detail.lifecycle_suspended'
                : 'detail.lifecycle_archived',
          )}
        </p>

        {transitions.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {transitions.map((next) => (
              <Button
                key={next}
                onClick={() => {
                  setTarget(next);
                  setReason('');
                  setError(null);
                }}
                variant={next === 'ACTIVE' ? 'default' : 'outline'}
              >
                {labels[next]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <Modal
        onOpenChange={(open) => {
          if (!open && !pending) setTarget(null);
        }}
        open={target !== null}
      >
        <ModalContent
          description={target ? bodies[target] : ''}
          title={target ? titles[target] : ''}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!target || pending || reason.trim().length < 3) return;
              setPending(true);
              setError(null);
              try {
                const updated = await orpc.platformAcademies.setStatus({
                  academyId: academy.id,
                  status: target,
                  reason: reason.trim(),
                });
                onChange(updated);
                setTarget(null);
                router.refresh();
              } catch (cause) {
                setError(cause);
              } finally {
                setPending(false);
              }
            }}
          >
            <div className="grid gap-1.5 px-6 py-5">
              <label
                className="text-[13.5px] font-bold text-ink"
                htmlFor="lifecycle-reason"
              >
                {t('detail.reason_label')}
                <span className="ml-1 text-danger">*</span>
              </label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                id="lifecycle-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
              <p className="text-[12.5px] text-sub">{t('detail.reason_hint')}</p>
              {error ? (
                <p className="mt-1 text-[13px] text-danger" role="alert">
                  {errorText(error)}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button
                disabled={pending}
                onClick={() => setTarget(null)}
                type="button"
                variant="ghost"
              >
                {t('create.cancel')}
              </Button>
              <Button
                disabled={pending || reason.trim().length < 3}
                type="submit"
                variant={target === 'ACTIVE' ? 'default' : 'danger'}
              >
                {pending ? t('detail.working') : t('detail.confirm')}
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </Panel>
  );
}
