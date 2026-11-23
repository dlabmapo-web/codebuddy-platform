'use client';

import { CLASS_MAX_ASSISTANT_TEACHERS } from '@cove/shared';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { ResponsiveMultiSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  assistantCandidates,
  canSubmitAssistants,
  currentAssistantIds,
  teacherSearchLabel,
} from '../_lib/teacher-assignment';

/**
 * Picks the teachers who help run this class beside its homeroom teacher.
 *
 * Multi-select, unlike the homeroom dialog: the homeroom teacher is one person
 * by definition, while the assistants are a set the manager edits as a whole.
 * Submitting the whole set is also what keeps adding one and dropping another
 * a single revision claim rather than two that could interleave.
 *
 * The homeroom teacher is filtered out of the options rather than shown and
 * refused — they already teach this class, and offering them would invite a
 * change the API exists to reject.
 */
export function AssistantTeachersDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const selectedIds = manager.selectedAssistantIds;
  const currentIds = currentAssistantIds(manager.detail.teachers);

  const list = assistantCandidates(
    manager.eligibleTeachers,
    manager.detail.assignedTeacher?.membershipId ?? null,
  ).map((teacher) => ({
    id: teacher.membershipId,
    name: teacherSearchLabel(teacher, t('detail.teacher_panel.no_name')),
    displayName: teacher.displayName,
    email: teacher.email,
    academyImageUrl: teacher.academyImageUrl,
    globalImageUrl: teacher.globalImageUrl,
    externalAvatarUrl: teacher.externalAvatarUrl,
  }));

  const overCap = selectedIds.length > CLASS_MAX_ASSISTANT_TEACHERS;
  const submittable = canSubmitAssistants({
    selectedIds,
    currentIds,
    pending: manager.assistantsPending,
  });

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeAssistants();
      }}
      open={manager.assistantsOpen}
    >
      <ModalContent
        description={t('assistants_dialog.body', {
          count: CLASS_MAX_ASSISTANT_TEACHERS,
        })}
        title={t('assistants_dialog.heading')}
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
              {t('assistants_dialog.none_eligible')}
            </p>
          ) : (
            <>
              <ResponsiveMultiSelector
                drawerTitle={t('assistants_dialog.heading')}
                emptyLabel={t('assistants_dialog.empty')}
                label={t('assistants_dialog.trigger_label')}
                list={list}
                listClassName="max-h-72"
                onSelect={(items) =>
                  manager.setSelectedAssistantIds(items.map((item) => item.id))
                }
                placeholder={t('assistants_dialog.search')}
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
                        {teacher.email ?? t('detail.teacher_panel.no_email')}
                      </span>
                    </span>
                  </span>
                )}
                selectedIds={selectedIds}
              />

              {/* Named before the save rather than after it: going over the cap
                  is the one refusal a manager can see coming. */}
              <p
                className={`text-[13.5px] font-semibold ${
                  overCap ? 'text-danger' : 'text-sub'
                }`}
              >
                {overCap
                  ? t('assistants_dialog.over_cap', {
                      count: CLASS_MAX_ASSISTANT_TEACHERS,
                    })
                  : t('assistants_dialog.selected', {
                      count: selectedIds.length,
                      max: CLASS_MAX_ASSISTANT_TEACHERS,
                    })}
              </p>
            </>
          )}

          {manager.assistantsError ? (
            <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.assistantsError, t('assistants_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.closeAssistants}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          {/* Disabled while pending, so a double click cannot send the same
              revision twice and turn the second one into a stale conflict. */}
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={!submittable}
            onClick={manager.saveAssistants}
            type="button"
          >
            {manager.assistantsPending
              ? t('assistants_dialog.submitting')
              : t('assistants_dialog.submit')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
