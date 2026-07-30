'use client';

import type { AcademyRole } from '@cove/shared';
import { useState } from 'react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

import { RoleSelector } from '../../_components/role-selector';
import type { ApplicationRequest } from '../_hooks/use-applications-manager';

/**
 * Approving needs a role and rejecting needs a reason, so review happens in a
 * dialog rather than crammed into a table row.
 */
export function ReviewModal({
  disabled,
  onApprove,
  onClose,
  onReject,
  request,
}: {
  disabled: boolean;
  onApprove: (role: AcademyRole, reason?: string) => void;
  onClose: () => void;
  onReject: (reason: string) => void;
  request: ApplicationRequest | null;
}) {
  const { t } = useLayoutTranslation(['applications', 'common']);
  const [role, setRole] = useState<AcademyRole>('STUDENT');
  const [reason, setReason] = useState('');

  if (!request) return null;

  const applicant =
    request.user.displayName ?? request.user.email ?? t('common:fallback.user');

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
          {request.message ? (
            <blockquote className="rounded-lg border-l-2 border-border bg-canvas px-4 py-3 text-[14px] leading-6">
              {request.message}
            </blockquote>
          ) : null}

          <div className="grid gap-1.5">
            <span className="text-[14px] font-bold">{t('role_label')}</span>
            <RoleSelector
              onChange={setRole}
              popoverClassName="w-64"
              value={role}
            />
          </div>

          <label className="grid gap-1.5">
            <span className="text-[14px] font-bold">
              {t('reason_label')}{' '}
              <span className="font-normal text-sub">
                {t('reason_hint')}
              </span>
            </span>
            <textarea
              className="min-h-20 w-full resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reason_placeholder')}
              value={reason}
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-white px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={onClose}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg border border-danger/40 bg-white px-4 text-[14.5px] font-bold text-danger transition-colors hover:bg-danger/5 disabled:opacity-40"
            disabled={disabled || !reason.trim()}
            onClick={() => onReject(reason)}
            title={reason.trim() ? undefined : t('reject_needs_reason')}
            type="button"
          >
            {t('reject')}
          </button>
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={disabled}
            onClick={() => onApprove(role, reason || undefined)}
            type="button"
          >
            {t('approve')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
