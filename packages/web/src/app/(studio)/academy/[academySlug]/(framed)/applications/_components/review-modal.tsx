'use client';

import type { AcademyRole, JoinRequestKind } from '@cove/shared';
import { useState } from 'react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { RequestedKindBadge } from '@/components/studio/role-badge';
import { useLayoutTranslation } from '@/i18n';

import { RoleSelector } from '../../_components/role-selector';

/**
 * The four fields this dialog reads from an application.
 *
 * Structural rather than the manager hook's row type, because the console's
 * cross-academy queue renders the same dialog over its own payload. Naming the
 * fields instead of the shape is what lets one review dialog serve both — and
 * one dialog is the point: a second copy would be a second place for the
 * confirmation rules to drift.
 */
export type ReviewableApplication = {
  message: string | null;
  requestedKind: JoinRequestKind;
  user: { displayName: string | null; email: string | null };
};

/**
 * Approving needs a role and rejecting needs a reason, so review happens in a
 * dialog rather than crammed into a table row.
 *
 * `notice` and `approveBlockedReason` are both optional and both unused by the
 * manager's own page. They exist for the console, where approving somebody as
 * the *first* manager of an empty academy hands over an entire academy on the
 * strength of a claim the platform cannot check — a different act from a
 * manager seating a student in an academy they already run. The caller decides
 * that, because the caller is the one that knows which surface it is.
 */
export function ReviewModal({
  approveBlockedReason,
  disabled,
  notice,
  onApprove,
  onClose,
  onReject,
  request,
  roles,
}: {
  /**
   * Why Approve is refused for the role currently picked, or null when it is
   * allowed. A message rather than a boolean: a disabled button with no reason
   * is a dead end, and this one is shown beside it.
   */
  approveBlockedReason?: (role: AcademyRole, reason: string) => string | null;
  disabled: boolean;
  /** Rendered above the role selector, for a warning about this application. */
  notice?: React.ReactNode;
  onApprove: (role: AcademyRole, reason?: string) => void;
  onClose: () => void;
  onReject: (reason: string) => void;
  request: ReviewableApplication | null;
  roles: readonly AcademyRole[];
}) {
  const { t } = useLayoutTranslation(['applications', 'common']);
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [reason, setReason] = useState('');

  if (!request) return null;
  if (!roles.includes(role)) {
    throw new Error('The selected application role is not approvable.');
  }

  const applicant =
    request.user.displayName ?? request.user.email ?? t('common:fallback.user');
  const blocked = approveBlockedReason?.(role, reason) ?? null;
  /*
   * Which way the grant and the request disagree, or null when they agree.
   *
   * A hint, exactly as the field is everywhere else: nothing here changes what
   * may be granted, and `canApproveAs` on the server is still the only thing
   * that bounds it. Staff covers three roles, so "asked as staff" is satisfied
   * by any of them and only `STUDENT` contradicts it.
   */
  const grantsStaff = role !== 'STUDENT';
  const mismatch: JoinRequestKind | null =
    request.requestedKind === 'STAFF' && !grantsStaff
      ? 'STAFF'
      : request.requestedKind === 'STUDENT' && grantsStaff
        ? 'STUDENT'
        : null;

  return (
    <Modal
      onOpenChange={(next) => {
        if (next) return;
        setRole('STUDENT');
        setReason('');
        onClose();
      }}
      open
    >
      <ModalContent description={request.user.email ?? ''} title={applicant}>
        <div className="space-y-4 px-6 py-5">
          {notice}
          {request.message ? (
            <blockquote className="rounded-lg border-l-2 border-border bg-canvas px-4 py-3 text-[14px] leading-6">
              {request.message}
            </blockquote>
          ) : null}

          {/*
            What they asked for, above the field that answers it.

            The dialog opens on Student regardless, so a staff applicant and a
            student applicant presented the reviewer with an identical screen —
            and the quickest path through it, press Approve, was right for one
            of them and wrong for the other. Stating the request here does not
            decide anything: the grant is still whatever the selector below
            says. It just stops the decision being made without it.
          */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-canvas px-3.5 py-2.5">
            <span className="text-[13px] font-bold text-sub">
              {t('requested_label')}
            </span>
            <RequestedKindBadge kind={request.requestedKind} />
          </div>

          <div className="grid gap-1.5">
            <span className="text-[14px] font-bold">{t('role_label')}</span>
            <RoleSelector
              onChange={setRole}
              popoverClassName="w-64"
              roles={roles}
              value={role}
            />
            {/*
              Only when the two disagree. A note that is always on the screen is
              furniture; this one appears exactly when the grant about to be
              made is not the one that was asked for, which is the only moment
              it carries information.
            */}
            {mismatch ? (
              <p className="text-[12.5px] font-semibold leading-[1.5] text-draft">
                {t(
                  mismatch === 'STAFF'
                    ? 'requested_note_staff'
                    : 'requested_note_student',
                  { name: applicant },
                )}
              </p>
            ) : null}
          </div>

          <label className="grid gap-1.5">
            <span className="text-[14px] font-bold">
              {t('reason_label')}{' '}
              <span className="font-normal text-sub">
                {t('reason_hint')}
              </span>
            </span>
            <textarea
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reason_placeholder')}
              value={reason}
            />
          </label>
        </div>

        {blocked ? (
          <p
            className="mx-6 mb-1 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[13px] font-semibold text-warning"
            role="status"
          >
            {blocked}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={onClose}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg border border-danger/40 bg-card px-4 text-[14.5px] font-bold text-danger transition-colors hover:bg-danger/5 disabled:opacity-40"
            disabled={disabled || !reason.trim()}
            onClick={() => onReject(reason)}
            title={reason.trim() ? undefined : t('reject_needs_reason')}
            type="button"
          >
            {t('reject')}
          </button>
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={disabled || Boolean(blocked)}
            onClick={() => onApprove(role, reason || undefined)}
            title={blocked ?? undefined}
            type="button"
          >
            {t('approve')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
