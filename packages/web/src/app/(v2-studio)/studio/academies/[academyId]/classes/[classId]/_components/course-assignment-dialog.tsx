'use client';

import { EyeOff, Info } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { ResponsiveMultiSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';

/**
 * Edits the complete course set, then sends it in one call. The server derives
 * additions and removals, so a slow connection cannot leave the class holding
 * half of a change.
 */
export function CourseAssignmentDialog({
  manager,
}: {
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const selectedIds = manager.selectedCourseIds;
  const list = manager.academyCourses.map((course) => ({
    id: course.id,
    name: course.title,
    isVisible: course.isVisible,
  }));
  const anyHiddenSelected = list.some(
    (course) => selectedIds.includes(course.id) && !course.isVisible,
  );

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeAssign();
      }}
      open={manager.assignOpen}
    >
      <ModalContent
        description={t('assign_dialog.body')}
        title={t('assign_dialog.heading')}
      >
        <div className="space-y-3 px-6 py-5">
          {manager.coursesLoading ? (
            <p className="text-[14px] text-sub">{t('common:state.loading')}</p>
          ) : list.length === 0 ? (
            <p className="rounded-lg bg-canvas px-3.5 py-3 text-[14px] leading-6 text-sub">
              {t('assign_dialog.no_courses')}
            </p>
          ) : (
            <>
              <ResponsiveMultiSelector
                drawerTitle={t('assign_dialog.heading')}
                emptyLabel={t('assign_dialog.empty')}
                label={t('assign_dialog.trigger_label')}
                list={list}
                listClassName="max-h-72"
                onSelect={(items) =>
                  manager.setSelectedCourseIds(items.map((item) => item.id))
                }
                placeholder={t('assign_dialog.search')}
                popoverClassName="w-[24rem]"
                renderItem={(course) => (
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{course.name}</span>
                    {course.isVisible ? null : (
                      <EyeOff className="size-3.5 shrink-0 text-draft" />
                    )}
                  </span>
                )}
                selectedIds={selectedIds}
              />
              <p className="text-[13.5px] font-semibold text-sub">
                {t('assign_dialog.selected', { count: selectedIds.length })}
              </p>
              {anyHiddenSelected ? (
                <p className="flex items-start gap-2 rounded-lg bg-draft-soft px-3.5 py-3 text-[13.5px] leading-5 text-draft">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  {t('assign_dialog.hidden_hint')}
                </p>
              ) : null}
            </>
          )}

          {manager.coursesError ? (
            <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
              {errorText(manager.coursesError, t('assign_dialog.failed'))}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-white px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={manager.closeAssign}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={manager.coursesPending || manager.coursesLoading}
            onClick={manager.saveCourses}
            type="button"
          >
            {manager.coursesPending
              ? t('assign_dialog.submitting')
              : t('assign_dialog.submit')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
