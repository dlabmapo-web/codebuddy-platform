'use client';

import type { PlatformUserSummary } from '@cove/shared';
import {
  Ellipsis,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Trash2,
  UserCheck,
  UserCog,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { userDisplayName } from '../_lib/user-view';
import { ReasonField, useRoleChange } from './user-action-dialogs';

/**
 * Everything an operator does to one account, behind one glyph.
 *
 * The same menu shape as `people-directory.tsx`'s `RowActions` — an `Ellipsis`
 * trigger, `align="end"`, destructive items under a separator — because an
 * operator who also manages an academy should not learn two menus (§7.3).
 *
 * Opening the account is deliberately **not** in here. It is what nearly every
 * row is clicked for, so it is a button of its own beside this glyph — a menu
 * is where the rarely-used and the destructive go, and burying the common case
 * behind two clicks to keep it company is the wrong trade.
 *
 * "Change role" stays for the account page's header, which has no Role chip.
 * The table passes `showRoleChange={false}`: the chip in the Role column is
 * the control there, and offering the same write twice on one row is the
 * duplication the lens rail was removed for.
 *
 * Granting or revoking platform operator is a separate item under its own
 * separator (§3.3), because `platformRole` is a different axis from an academy
 * role and a radio group would imply an exclusivity that does not hold.
 *
 * Server-side refusals — last active manager, last operator — are shown as
 * returned errors, never predicted by disabling the item: a button disabled
 * by a rule the browser guessed at is wrong the moment another tab changes the
 * state it guessed from.
 */
export function UserRowActions({
  person,
  onUpdated,
  showRoleChange = true,
  trigger,
}: {
  person: PlatformUserSummary;
  onUpdated: (userId: string) => void;
  /** False where a Role chip already offers it — the directory table. */
  showRoleChange?: boolean;
  /** A custom trigger for the account page header; the table uses the default
   * icon button. */
  trigger?: React.ReactNode;
}) {
  const { t } = useTranslation('platform-users');
  const role = useRoleChange(person, onUpdated);
  const [operatorOpen, setOperatorOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<
    'SUSPENDED' | 'ACTIVE' | null
  >(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const statusItem =
    person.status === 'ACTIVE'
      ? 'suspend'
      : person.status === 'SUSPENDED' || person.status === 'DELETED'
        ? 'restore'
        : null;

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <button
              aria-label={t('action.menu')}
              className="grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink data-[state=open]:bg-accent data-[state=open]:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              type="button"
            >
              <Ellipsis className="size-4" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {showRoleChange && role.available ? (
            <DropdownMenuItem
              // Always the per-academy dialog, even for one membership. A
              // menu item cannot carry a radio group without a submenu, and a
              // submenu that exists only when the account happens to have one
              // academy is a control that changes shape between rows.
              onSelect={(event) => {
                event.preventDefault();
                role.pickMany();
              }}
            >
              <UserCog className="text-sub" />
              {t('action.change_role')}
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setOperatorOpen(true);
            }}
          >
            {person.platformRole === 'ADMIN' ? (
              <ShieldX className="text-sub" />
            ) : (
              <ShieldCheck className="text-sub" />
            )}
            {person.platformRole === 'ADMIN'
              ? t('action.remove_operator')
              : t('action.make_operator')}
          </DropdownMenuItem>

          {statusItem ? (
            <>
              <DropdownMenuSeparator />
              {statusItem === 'suspend' ? (
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  onSelect={(event) => {
                    event.preventDefault();
                    setStatusTarget('SUSPENDED');
                  }}
                >
                  <ShieldOff className="text-danger" />
                  {t('action.suspend')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setStatusTarget('ACTIVE');
                  }}
                >
                  <UserCheck className="text-success" />
                  {t('action.restore')}
                </DropdownMenuItem>
              )}
            </>
          ) : null}

          {person.status !== 'DELETED' ? (
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onSelect={(event) => {
                event.preventDefault();
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="text-danger" />
              {t('action.delete')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {role.dialogs}
      <OperatorDialog
        onClose={() => setOperatorOpen(false)}
        onDone={() => {
          setOperatorOpen(false);
          onUpdated(person.userId);
        }}
        open={operatorOpen}
        person={person}
      />
      <StatusDialog
        onClose={() => setStatusTarget(null)}
        onDone={() => {
          setStatusTarget(null);
          onUpdated(person.userId);
        }}
        person={person}
        target={statusTarget}
      />
      <DeleteDialog
        onClose={() => setDeleteOpen(false)}
        onDone={() => {
          setDeleteOpen(false);
          onUpdated(person.userId);
        }}
        open={deleteOpen}
        person={person}
      />
    </div>
  );
}

/* -------------------------------------------------------------- operator */

function OperatorDialog({
  onClose,
  onDone,
  open,
  person,
}: {
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  person: PlatformUserSummary;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const granting = person.platformRole !== 'ADMIN';

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <ModalContent
        description={
          granting ? t('operator.confirm_grant_body') : t('operator.confirm_revoke_body')
        }
        title={
          granting
            ? t('operator.confirm_grant_title', { name: userDisplayName(person) })
            : t('operator.confirm_revoke_title', { name: userDisplayName(person) })
        }
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await orpc.platformUsers.setPlatformRole({
                userId: person.userId,
                platformRole: granting ? 'ADMIN' : 'USER',
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
            <Button
              disabled={pending || reason.trim().length < 8}
              type="submit"
              variant={granting ? 'default' : 'danger'}
            >
              {pending ? t('role_change.working') : t('role_change.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

/* ---------------------------------------------------------------- status */

function StatusDialog({
  onClose,
  onDone,
  person,
  target,
}: {
  onClose: () => void;
  onDone: () => void;
  person: PlatformUserSummary;
  target: 'SUSPENDED' | 'ACTIVE' | null;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={Boolean(target)}>
      <ModalContent
        description={
          target === 'SUSPENDED'
            ? t('detail.confirm_suspend_body')
            : t('detail.confirm_restore_body')
        }
        title={
          target === 'SUSPENDED'
            ? t('detail.confirm_suspend_title', { name: userDisplayName(person) })
            : t('detail.confirm_restore_title', { name: userDisplayName(person) })
        }
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            setPending(true);
            setError(null);
            try {
              await orpc.platformUsers.setStatus({
                userId: person.userId,
                status: target,
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
            <Button
              disabled={pending || reason.trim().length < 8}
              type="submit"
              variant={target === 'SUSPENDED' ? 'danger' : 'default'}
            >
              {pending ? t('detail.working') : t('detail.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

/* ---------------------------------------------------------------- delete */

/**
 * The only irreversible-*feeling* action on this page, though §3.7 is
 * explicit that it is not actually erasure: memberships, submissions, and
 * history all survive. The copy says so, because "delete" promises otherwise
 * and a promise the system does not keep is worse than a longer label.
 */
function DeleteDialog({
  onClose,
  onDone,
  open,
  person,
}: {
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  person: PlatformUserSummary;
}) {
  const { t } = useTranslation('platform-users');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const confirmTarget = (person.email ?? person.username ?? '').toLowerCase();
  const confirmed =
    confirmTarget.length > 0 && handle.trim().toLowerCase() === confirmTarget;

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <ModalContent
        description={t('delete.body')}
        title={t('delete.title', { name: userDisplayName(person) })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await orpc.platformUsers.setStatus({
                userId: person.userId,
                status: 'DELETED',
                reason: reason.trim(),
                confirmHandle: handle.trim(),
              });
              setReason('');
              setHandle('');
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-3 px-6 py-5">
            <p className="rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-[13px] leading-6 text-ink">
              {t('delete.stakes')}
            </p>
            <div className="grid gap-1.5">
              <label className="text-[13.5px] font-bold text-ink" htmlFor="delete-handle">
                {t('delete.confirm_label', { handle: confirmTarget })}
                <span className="ml-1 text-danger">*</span>
              </label>
              <input
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-[14px] text-ink outline-none focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/30"
                id="delete-handle"
                onChange={(event) => setHandle(event.target.value)}
                value={handle}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[13.5px] font-bold text-ink" htmlFor="delete-reason">
                {t('action.reason_label')}
                <span className="ml-1 text-danger">*</span>
              </label>
              <textarea
                className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
                id="delete-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
              <p className="text-[12.5px] text-sub">{t('action.reason_hint')}</p>
            </div>
            {error ? (
              <p className="text-[13px] text-danger" role="alert">
                {errorText(error)}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
              {t('role_change.cancel')}
            </Button>
            <Button
              disabled={pending || !confirmed || reason.trim().length < 8}
              type="submit"
              variant="danger"
            >
              {pending ? t('delete.working') : t('delete.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
