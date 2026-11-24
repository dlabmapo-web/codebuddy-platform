'use client';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { ResponsiveMultiSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  canSubmitTeachers,
  currentTeacherIds,
  teacherSearchLabel,
} from '../_lib/teacher-assignment';

/**
 * Picks every teacher of this class: one list, all on the same terms, and as
 * many as the manager wants. Submitting the whole set keeps adding one and
 * dropping another a single revision claim rather than two that could
 * interleave.
 */
export function TeachersDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const selectedIds = manager.selectedTeacherIds;
  const currentIds = currentTeacherIds(manager.detail.teachers);

  const list = manager.eligibleTeachers.map((teacher) => ({
    id: teacher.membershipId,
    name: teacherSearchLabel(teacher, t('detail.teacher_panel.no_name')),
    displayName: teacher.displayName,
    email: teacher.email,
    username: teacher.username ?? null,
    academyImageUrl: teacher.academyImageUrl,
    globalImageUrl: teacher.globalImageUrl,
    externalAvatarUrl: teacher.externalAvatarUrl,
  }));

  const submittable = canSubmitTeachers({
    selectedIds,
    currentIds,
    pending: manager.teachersPending,
  });

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeTeachers();
      }}
      open={manager.teachersOpen}
    >
      <ModalContent
        description={t('teachers_dialog.body')}
        title={t('teachers_dialog.heading')}
      >
        <div className="space-y-3 px-6 py-5">
          {manager.eligibleTeachersError ? (
            <div className="rounded-lg bg-danger/5 px-3.5 py-3 text-[14px] text-danger">
              <p className="font-semibold">{t('teachers_dialog.load_failed')}</p>
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
              {t('teachers_dialog.none_eligible')}
            </p>
          ) : (
            <>
              <ResponsiveMultiSelector
                drawerTitle={t('teachers_dialog.heading')}
                emptyLabel={t('teachers_dialog.empty')}
                label={t('teachers_dialog.trigger_label')}
                list={list}
                listClassName="max-h-72"
                onSelect={(items) =>
                  manager.setSelectedTeacherIds(items.map((item) => item.id))
                }
                placeholder={t('teachers_dialog.search')}
                popoverClassName="w-[24rem]"
                renderItem={(teacher) => (
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* A picker is where a manager is choosing between people
                        who may share a name, so the face is worth more here
                        than anywhere else on the page. */}
                    <ProfileAvatar
                      academyImageUrl={teacher.academyImageUrl}
                      externalAvatarUrl={teacher.externalAvatarUrl}
                      globalImageUrl={teacher.globalImageUrl}
                      name={teacher.displayName}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">
                        {teacher.displayName ??
                          teacher.email ??
                          t('detail.teacher_panel.no_name')}
                      </span>
                      <span className="truncate text-[12px] text-sub">
                        {[teacher.email, teacher.username ? `@${teacher.username}` : null].filter(Boolean).join(' · ') ||
                          t('detail.teacher_panel.no_email')}
                      </span>
                    </span>
                  </span>
                )}
                selectedIds={selectedIds}
              />

              <p className="text-[13.5px] font-semibold text-sub">
                {t('teachers_dialog.selected', { count: selectedIds.length })}
              </p>
            </>
          )}

          {manager.teachersError ? (
            <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.teachersError, t('teachers_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.closeTeachers}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          {/* Disabled while pending, so a double click cannot send the same
              revision twice and turn the second one into a stale conflict. */}
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={!submittable}
            onClick={manager.saveTeachers}
            type="button"
          >
            {manager.teachersPending
              ? t('teachers_dialog.submitting')
              : t('teachers_dialog.submit')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
