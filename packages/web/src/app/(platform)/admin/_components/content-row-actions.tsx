'use client';

import { ArrowRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * Everything an operator does to one course or class.
 *
 * Lifted out of the academy detail page so the cross-academy browser and the
 * per-academy panel offer one menu rather than two that must never disagree.
 * The delete confirmation in particular has one definition here: two copies of
 * a destructive dialog is two places for the confirmation rule to drift.
 *
 * `Open` is out of the menu and beside it, because it is what nearly every row
 * is clicked for — and putting the common action behind two clicks to keep the
 * destructive one company is the wrong trade. It is a quiet arrow rather than a
 * filled button, matching the users directory: a blue block on every row of a
 * table competes with the row's own content, and the whole row is clickable
 * anyway.
 *
 * There is deliberately no `Edit` item. It pointed at the same href as `Open`,
 * so the menu offered a second name for one destination — and a reader who
 * tries both learns the menu is not telling them the truth about what it does.
 * The destination *is* the editor; `Open` is the honest word for going there.
 *
 * `Rename` is not that item returning under another name. It opens a dialog and
 * changes two fields in place, without leaving the table — which is the whole
 * reason it exists: fixing a customer's typo used to cost a round trip into
 * their academy. It is optional, because the academy detail page offers the
 * same menu without a dialog to open.
 *
 * Refusals are shown, never predicted. The server declines to delete a course
 * or class with student work behind it; that answer arrives in the dialog. An
 * item disabled by a rule the browser guessed at is wrong the moment another
 * tab changes the state it guessed from.
 */
export type ContentDeleteTarget =
  | { kind: 'course'; id: string; label: string }
  | { kind: 'class'; id: string; label: string };

export function ContentRowActions({
  deleteLabel,
  label,
  onDelete,
  onRename,
  href,
  statusAction,
}: {
  deleteLabel: string;
  label: string;
  onDelete: () => void;
  /** Omitted where the surface has no rename dialog to open. */
  onRename?: () => void;
  href: string;
  statusAction?: {
    disabled?: boolean;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onSelect: () => void;
  };
}) {
  const { t } = useTranslation('platform');
  const { t: content } = useTranslation('platform-content');
  const StatusIcon = statusAction?.icon;
  return (
    <div
      className="flex items-center justify-end gap-0.5"
      onClick={(event) => event.stopPropagation()}
    >
      <Link
        aria-label={content('table.open')}
        className="group grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={href}
        title={content('table.open')}
      >
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t('table.more')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-canvas data-[state=open]:text-ink"
            type="button"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[13rem] text-[14.5px]">
          <DropdownMenuLabel className="truncate text-[12.5px]">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onRename ? (
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="text-sub" />
              {content('table.rename')}
            </DropdownMenuItem>
          ) : null}
          {statusAction && StatusIcon ? (
            <DropdownMenuItem
              disabled={statusAction.disabled}
              onSelect={statusAction.onSelect}
            >
              <StatusIcon className="text-sub" />
              {statusAction.label}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete}>
            <Trash2 className="text-danger" />
            <span className="text-danger">{deleteLabel}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One dialog for both kinds.
 *
 * Each asks for its name typed back, as academy deletion does — the destructive
 * acts in this product should ask the same thing of the person doing them.
 *
 * The server refuses either outright once a student has submitted, which is the
 * guarantee that matters and the one this form cannot make.
 */
export function ContentDeleteDialog({
  academyId,
  onClose,
  onDone,
  target,
}: {
  academyId: string | null;
  onClose: () => void;
  onDone: () => void;
  target: ContentDeleteTarget | null;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const confirmed =
    Boolean(target) && typed.trim() === target?.label.trim();

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={Boolean(target)}>
      <ModalContent
        description={t(
          target?.kind === 'class'
            ? 'content_delete.class_body'
            : 'content_delete.course_body',
        )}
        title={t('content_delete.title', { name: target?.label ?? '' })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target || !academyId) return;
            setBusy(true);
            setError(null);
            try {
              if (target.kind === 'course') {
                await orpc.academyCourses.delete({
                  academyId,
                  courseId: target.id,
                  confirmTitle: typed.trim(),
                });
              } else {
                await orpc.academyClasses.delete({
                  academyId,
                  classId: target.id,
                  confirmName: typed.trim(),
                });
              }
              setTyped('');
              setError(null);
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-1.5 px-6 py-5">
            <label
              className="text-[13.5px] font-bold text-ink"
              htmlFor="content-delete-confirm"
            >
              {t('content_delete.confirm_label', { name: target?.label ?? '' })}
              <span className="ml-1 text-danger">*</span>
            </label>
            <input
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/30"
              id="content-delete-confirm"
              onChange={(event) => setTyped(event.target.value)}
              value={typed}
            />
            {error ? (
              <p className="mt-1 text-[13px] text-danger" role="alert">{errorText(error)}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={busy} onClick={close} type="button" variant="ghost">
              {t('create.cancel')}
            </Button>
            <Button disabled={busy || !confirmed} type="submit" variant="danger">
              {busy ? t('delete.working') : t('delete.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
