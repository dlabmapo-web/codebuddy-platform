'use client';

import { AlertTriangle } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { ResponsiveSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  canSubmitTeacherSelection,
  isReplacement,
  teacherDisplayName,
} from '../_lib/teacher-assignment';

/**
 * Picks the one teacher responsible for this class.
 *
 * Single-select throughout — `ResponsiveSelector`, not the multi-selector the
 * course and student dialogs use. A checkbox list would suggest a class can
 * have two teachers, which is exactly the shape the schema forbids.
 *
 * The list arrives from the server already filtered to active same-academy
 * teachers, so the dialog never offers a choice the mutation would reject.
 */
export function TeacherAssignmentDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const current = manager.detail.assignedTeacher;
  const selectedId = manager.selectedTeacherId;

  const list = manager.eligibleTeachers.map((teacher) => ({
    id: teacher.membershipId,
    // Search matches on both halves, so either one finds the row.
    name:
      [teacher.displayName, teacher.email].filter(Boolean).join(' · ') ||
      t('detail.teacher_panel.no_name'),
    displayName: teacher.displayName,
    email: teacher.email,
  }));

  const currentId = current?.membershipId ?? null;
  // Only warn about a teacher who is actually being displaced: reopening the
  // dialog on the current teacher and saving changes nothing.
  const replacing = isReplacement({ selectedId, currentId });
  const submittable = canSubmitTeacherSelection({
    selectedId,
    currentId,
    pending: manager.teacherPending,
  });

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeTeacher();
      }}
      open={manager.teacherOpen}
    >
      <ModalContent
        description={t('teacher_dialog.body')}
        title={
          current
            ? t('teacher_dialog.heading_replace')
            : t('teacher_dialog.heading_assign')
        }
      >
        <div className="space-y-3 px-6 py-5">
          {manager.eligibleTeachersError ? (
            <div className="rounded-lg bg-danger/5 px-3.5 py-3 text-[14px] text-danger">
              <p className="font-semibold">{t('teacher_dialog.load_failed')}</p>
              <button
                className="mt-2 font-bold underline underline-offset-2"
                onClick={() => void manager.retryEligibleTeachers()}
                type="button"
              >
                {t('common:action.try_again')}
              </button>
            </div>
          ) : manager.eligibleTeachersLoading ? (
            <p className="text-[14px] text-sub">{t('common:state.loading')}</p>
          ) : list.length === 0 ? (
            <p className="rounded-lg bg-canvas px-3.5 py-3 text-[14px] leading-6 text-sub">
              {t('teacher_dialog.none_eligible')}
            </p>
          ) : (
            <>
              <ResponsiveSelector
                drawerTitle={t('teacher_dialog.trigger_label')}
                emptyLabel={t('teacher_dialog.empty')}
                label={t('teacher_dialog.trigger_label')}
                list={list}
                listClassName="max-h-72"
                onSelect={(item) => manager.setSelectedTeacherId(item.id)}
                placeholder={t('teacher_dialog.search')}
                popoverClassName="w-[24rem]"
                renderItem={(teacher) => (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">
                      {teacher.displayName ??
                        teacher.email ??
                        t('detail.teacher_panel.no_name')}
                    </span>
                    <span className="truncate text-[12px] text-sub">
                      {teacher.email ?? t('detail.teacher_panel.no_email')}
                    </span>
                  </span>
                )}
                selectedId={selectedId}
              />

              {selectedId === null ? (
                <p className="text-[13.5px] font-semibold text-sub">
                  {t('teacher_dialog.unselected')}
                </p>
              ) : null}

              {/* Replacement is not an edit to a label. It ends somebody's
                  access to this class, and says so before the save. */}
              {replacing ? (
                <p className="flex items-start gap-2 rounded-lg bg-draft-soft px-3.5 py-3 text-[13.5px] leading-5 font-semibold text-draft">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('teacher_dialog.replace_warning', {
                    name: teacherDisplayName(
                      current,
                      t('detail.teacher_panel.no_name'),
                    ),
                  })}
                </p>
              ) : null}
            </>
          )}

          {manager.teacherError ? (
            <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.teacherError, t('teacher_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-white px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.closeTeacher}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          {/* Disabled while pending, so a double click cannot send the same
              revision twice and turn the second one into a stale conflict. */}
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={!submittable}
            onClick={manager.saveTeacher}
            type="button"
          >
            {manager.teacherPending
              ? t('teacher_dialog.submitting')
              : current
                ? t('teacher_dialog.submit_replace')
                : t('teacher_dialog.submit_assign')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
