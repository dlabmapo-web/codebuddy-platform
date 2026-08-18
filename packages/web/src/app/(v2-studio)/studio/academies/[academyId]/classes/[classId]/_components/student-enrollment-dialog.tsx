'use client';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { ResponsiveMultiSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';

/**
 * Adds a bounded batch in one call. The list comes from the server already
 * filtered to active same-academy students who are not on this roster, so the
 * dialog never offers a choice the API would reject.
 */
export function StudentEnrollmentDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const selectedIds = manager.selectedMembershipIds;

  const list = manager.eligibleStudents.map((student) => ({
    id: student.membershipId,
    // Search matches on both, so a Manager can type either half.
    name: [student.displayName, student.email].filter(Boolean).join(' · ') ||
      t('detail.students_panel.no_name'),
    email: student.email,
    displayName: student.displayName,
    academyImageUrl: student.academyImageUrl,
    globalImageUrl: student.globalImageUrl,
    externalAvatarUrl: student.externalAvatarUrl,
  }));

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeEnroll();
      }}
      open={manager.enrollOpen}
    >
      <ModalContent
        description={t('enroll_dialog.body')}
        title={t('enroll_dialog.heading')}
      >
        <div className="space-y-3 px-6 py-5">
          {manager.eligibleLoading ? (
            <p className="text-[14px] text-sub">{t('common:state.loading')}</p>
          ) : list.length === 0 ? (
            <p className="rounded-lg bg-canvas px-3.5 py-3 text-[14px] leading-6 text-sub">
              {t('enroll_dialog.none_eligible')}
            </p>
          ) : (
            <>
              <ResponsiveMultiSelector
                drawerTitle={t('enroll_dialog.heading')}
                emptyLabel={t('enroll_dialog.empty')}
                label={t('enroll_dialog.trigger_label')}
                list={list}
                listClassName="max-h-72"
                onSelect={(items) =>
                  manager.setSelectedMembershipIds(items.map((item) => item.id))
                }
                placeholder={t('enroll_dialog.search')}
                popoverClassName="w-[24rem]"
                renderItem={(student) => (
                  <span className="flex min-w-0 items-center gap-2.5">
                    {/* A picker is where a manager is choosing between people
                        who may share a name, so the face is worth more here
                        than anywhere else on the page. */}
                    <ProfileAvatar
                      academyImageUrl={student.academyImageUrl}
                      externalAvatarUrl={student.externalAvatarUrl}
                      globalImageUrl={student.globalImageUrl}
                      name={student.displayName}
                      size="sm"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">
                        {student.displayName ??
                          student.email ??
                          t('detail.students_panel.no_name')}
                      </span>
                      <span className="truncate text-[12px] text-sub">
                        {student.email ?? t('detail.students_panel.no_email')}
                      </span>
                    </span>
                  </span>
                )}
                selectedIds={selectedIds}
              />
              <p className="text-[13.5px] font-semibold text-sub">
                {t('enroll_dialog.selected', { count: selectedIds.length })}
              </p>
            </>
          )}

          {manager.addError ? (
            <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.addError, t('enroll_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.closeEnroll}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={selectedIds.length === 0 || manager.addPending}
            onClick={manager.addStudents}
            type="button"
          >
            {manager.addPending
              ? t('enroll_dialog.submitting')
              : t('enroll_dialog.submit')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
