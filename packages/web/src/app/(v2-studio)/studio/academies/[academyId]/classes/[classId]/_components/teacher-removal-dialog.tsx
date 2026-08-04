'use client';

import { CircleCheck, UserMinus } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';

/**
 * Confirms clearing the assignment.
 *
 * Separate from the course and student removals because the promise is
 * different: nothing is archived and no work is at stake. The class keeps its
 * courses, its roster, and its active status, and simply runs unassigned —
 * which is a legitimate state, not a broken one.
 */
export function TeacherRemovalDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const removing = manager.removing;
  if (removing?.kind !== 'teacher') return null;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.cancelRemoval();
      }}
      open
    >
      <ModalContent
        description={t('remove_teacher.body', { name: removing.name })}
        title={t('remove_teacher.heading')}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
              <UserMinus className="size-5" />
            </span>
            <p className="min-w-0 break-words pt-2 text-[15px] font-bold text-ink">
              {removing.name}
            </p>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success/5 px-3.5 py-3 text-[13.5px] leading-5 text-sub">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <p>{t('detail.teacher_panel.body')}</p>
          </div>

          {manager.removalError ? (
            <p className="mt-4 rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.removalError, t('teacher_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-white px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.cancelRemoval}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-danger px-5 text-[14.5px] font-bold text-white transition-colors hover:bg-danger/90 disabled:opacity-40"
            disabled={manager.removalPending}
            onClick={manager.confirmRemoval}
            type="button"
          >
            {manager.removalPending
              ? t('remove_teacher.submitting')
              : t('remove_teacher.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
