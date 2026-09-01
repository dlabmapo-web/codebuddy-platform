'use client';

import type { AcademyRole, PlatformUserSummary } from '@cove/shared';
import { academyRoles } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { userDisplayName } from '../_lib/user-view';

/**
 * Changing a role, from either of the two places that offer it.
 *
 * The Role chip in the table opens this, and so does the account page's
 * header menu. They are one flow with two entrances, so the dialogs and the
 * state that drives them live here rather than inside whichever component
 * happened to need them first.
 *
 * `ReasonField` sits here for the same reason: every console mutation states a
 * reason for the audit trail, and two spellings of "Reason" in one console is
 * worse than one shared component in a file named for something else.
 */

/**
 * The role-change flow as one handle.
 *
 * `pick` takes a chosen role for a single membership; `pickMany` opens the
 * per-academy dialog. `dialogs` is rendered once by the caller — both are
 * mounted and closed, so neither costs anything until one is opened.
 */
export function useRoleChange(
  person: PlatformUserSummary,
  onUpdated: (userId: string) => void,
) {
  const [target, setTarget] = React.useState<
    { membershipId: string; role: AcademyRole } | null
  >(null);
  const [manyOpen, setManyOpen] = React.useState(false);

  const active = person.memberships.filter(
    (membership) => membership.status === 'ACTIVE',
  );

  const done = React.useCallback(() => {
    setTarget(null);
    setManyOpen(false);
    onUpdated(person.userId);
  }, [onUpdated, person.userId]);

  return {
    /** Whether there is anything to change at all. */
    available: active.length > 0,
    pick: setTarget,
    pickMany: React.useCallback(() => setManyOpen(true), []),
    dialogs: (
      <>
        <SingleRoleDialog
          onClose={() => setTarget(null)}
          onDone={done}
          person={person}
          target={target}
        />
        <MultiRoleDialog
          memberships={active}
          onClose={() => setManyOpen(false)}
          onDone={done}
          open={manyOpen}
          person={person}
        />
      </>
    ),
  };
}

/* --------------------------------------------------------------- helpers */

export function ReasonField({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation('platform-users');
  return (
    <div className="grid gap-1.5 px-6 py-5">
      <label className="text-[13.5px] font-bold text-ink" htmlFor="user-action-reason">
        {t('action.reason_label')}
        <span className="ml-1 text-danger">*</span>
      </label>
      <textarea
        className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
        id="user-action-reason"
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      <p className="text-[12.5px] text-sub">{t('action.reason_hint')}</p>
    </div>
  );
}

/* ---------------------------------------------------------- role: single */

function SingleRoleDialog({
  onClose,
  onDone,
  person,
  target,
}: {
  onClose: () => void;
  onDone: () => void;
  person: PlatformUserSummary;
  target: { membershipId: string; role: AcademyRole } | null;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={Boolean(target)}>
      <ModalContent
        description={t('role_change.body')}
        title={t('role_change.title_single', {
          role: target ? t(`role.${target.role}`) : '',
        })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            setPending(true);
            setError(null);
            try {
              await orpc.platformUsers.setMembershipRole({
                userId: person.userId,
                membershipId: target.membershipId,
                role: target.role,
                reason: reason.trim(),
              });
              setReason('');
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setPending(false);
            }
          }}
        >
          <ReasonField onChange={setReason} value={reason} />
          {error ? (
            <p className="px-6 pb-1 text-[13px] text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
              {t('role_change.cancel')}
            </Button>
            <Button disabled={pending || reason.trim().length < 8} type="submit">
              {pending ? t('role_change.working') : t('role_change.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

/* ----------------------------------------------------------- role: multi */

function MultiRoleDialog({
  memberships,
  onClose,
  onDone,
  open,
  person,
}: {
  memberships: PlatformUserSummary['memberships'];
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  person: PlatformUserSummary;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [picked, setPicked] = React.useState<Record<string, AcademyRole>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const roleFor = (membershipId: string, current: AcademyRole) =>
    picked[membershipId] ?? current;

  const changedEntries = memberships
    .map((membership) => ({
      membership,
      role: roleFor(membership.membershipId, membership.role),
    }))
    .filter((entry) => entry.role !== entry.membership.role);

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <ModalContent
        description={t('role_change.body_multi', { count: memberships.length })}
        title={t('role_change.title_academies', {
          count: memberships.length,
          name: userDisplayName(person),
        })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              for (const entry of changedEntries) {
                await orpc.platformUsers.setMembershipRole({
                  userId: person.userId,
                  membershipId: entry.membership.membershipId,
                  role: entry.role,
                  reason: reason.trim(),
                });
              }
              setReason('');
              setPicked({});
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-2.5 px-6 py-5">
            {memberships.map((membership) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                key={membership.membershipId}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    {membership.academyName}
                  </p>
                </div>
                <select
                  className="h-9 shrink-0 rounded-lg border border-border bg-card px-2 text-[13px] font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  onChange={(event) =>
                    setPicked((current) => ({
                      ...current,
                      [membership.membershipId]: event.target.value as AcademyRole,
                    }))
                  }
                  value={roleFor(membership.membershipId, membership.role)}
                >
                  {academyRoles.map((role) => (
                    <option key={role} value={role}>
                      {t(`role.${role}`)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <ReasonField onChange={setReason} value={reason} />
          {error ? (
            <p className="px-6 pb-1 text-[13px] text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
              {t('role_change.cancel')}
            </Button>
            <Button
              disabled={pending || changedEntries.length === 0 || reason.trim().length < 8}
              type="submit"
            >
              {pending ? t('role_change.working') : t('role_change.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
