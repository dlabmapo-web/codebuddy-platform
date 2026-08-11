'use client';

import { BookOpen, RotateCcw, UserMinus } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';

/**
 * One dialog for both removals, because they make the same promise: access
 * stops now, the work stays. Splitting them would risk the two halves drifting
 * into different wording for the same guarantee.
 *
 * Removing a teacher is deliberately not here. It promises something else —
 * the class keeps running, unassigned — and folding it in would put a
 * "your work is saved" reassurance under a question about staffing.
 */
export function AccessRemovalDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const removing = manager.removing;
  if (!removing || removing.kind === 'teacher') return null;

  const isCourse = removing.kind === 'course';
  const subject = isCourse ? removing.title : removing.name;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.cancelRemoval();
      }}
      open
    >
      <ModalContent
        description={
          isCourse
            ? t('remove_course.body', {
                className: manager.detail.name,
                courseTitle: removing.title,
              })
            : t('remove_student.body', { name: removing.name })
        }
        title={isCourse ? t('remove_course.heading') : t('remove_student.heading')}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
              {isCourse ? (
                <BookOpen className="size-5" />
              ) : (
                <UserMinus className="size-5" />
              )}
            </span>
            <p className="min-w-0 break-words pt-2 text-[15px] font-bold text-ink">
              {subject}
            </p>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success/5 px-3.5 py-3 text-[13.5px] leading-5 text-sub">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-success" />
            <p>{t('archive_dialog.preserved')}</p>
          </div>

          {manager.removalError ? (
            <p className="mt-4 rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(
                manager.removalError,
                isCourse ? t('assign_dialog.failed') : t('enroll_dialog.failed'),
              )}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.cancelRemoval}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          {/* The row disappears only after the API confirms it, so a failed
              removal leaves the panel exactly as it was. */}
          <button
            className="h-11 rounded-lg bg-danger px-5 text-[14.5px] font-bold text-on-danger transition-colors hover:bg-danger/90 disabled:opacity-40"
            disabled={manager.removalPending}
            onClick={manager.confirmRemoval}
            type="button"
          >
            {manager.removalPending
              ? isCourse
                ? t('remove_course.submitting')
                : t('remove_student.submitting')
              : isCourse
                ? t('remove_course.confirm')
                : t('remove_student.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
