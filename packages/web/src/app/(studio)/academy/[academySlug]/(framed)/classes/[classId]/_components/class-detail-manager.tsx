'use client';

import type { ClassDetail } from '@cove/shared';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { ClassPointsBoard } from '../../../_components/class-points/class-points-board';
import { ArchiveClassDialog } from '../../_components/archive-class-dialog';
import { useClassDetailManager } from '../_hooks/use-class-detail-manager';
import { AccessRemovalDialog } from './access-removal-dialog';
import { ClassCoursesPanel } from './class-courses-panel';
import { ClassHeader } from './class-header';
import { ClassOverviewCard } from './class-overview-card';
import { ClassSchedulePanel } from './class-schedule-panel';
import { ClassStudentsPanel } from './class-students-panel';
import { ClassTeacherPanel } from './class-teacher-panel';
import { CourseAssignmentDialog } from './course-assignment-dialog';
import { StudentEnrollmentDialog } from './student-enrollment-dialog';
import { TeacherAssignmentDialog } from './teacher-assignment-dialog';
import { TeacherRemovalDialog } from './teacher-removal-dialog';

export function ClassDetailManager({
  academyId,
  canAssignCourses,
  canAssignTeacher,
  canEnroll,
  canSetSchedule,
  initialDetail,
}: {
  academyId: string;
  canAssignCourses: boolean;
  canAssignTeacher: boolean;
  canEnroll: boolean;
  canSetSchedule: boolean;
  initialDetail: ClassDetail;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const manager = useClassDetailManager({
    academyId,
    classId: initialDetail.id,
    initialDetail,
    canAssignCourses,
    canEnroll,
    canAssignTeacher,
  });

  return (
    <div className="space-y-5">
      <ClassHeader manager={manager} />

      <ClassOverviewCard detail={manager.detail} />

      {/* Courses, then the timetable, then the teacher, then the roster: what
          is taught, when it meets, who teaches it, and only then the long list
          of who takes it. The roster is the one panel that grows without
          bound, so it goes last rather than pushing a one-line answer below a
          page of rows. */}
      <ClassCoursesPanel
        canAssign={canAssignCourses}
        manager={manager}
      />
      <ClassSchedulePanel canEdit={canSetSchedule} manager={manager} />
      <ClassTeacherPanel canAssign={canAssignTeacher} manager={manager} />
      <ClassStudentsPanel
        canEnroll={canEnroll}
        manager={manager}
      />

      {/*
       * §5.1 — the identical board this class's students see, and the last
       * thing on the page because it is the only panel that says anything
       * about how individual children are doing. It renders nothing when the
       * academy does not run points.
       */}
      <ClassPointsBoard academyId={academyId} classId={manager.detail.id} />

      {manager.loadError ? (
        <p className="text-[14px] font-semibold text-sub">{t('load_failed')}</p>
      ) : null}
      {manager.statusError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.statusError, t('archive_dialog.failed'))}
        </p>
      ) : null}

      <EditClassModal manager={manager} />
      {manager.archiveOpen ? (
        <ArchiveClassDialog
          courseCount={manager.detail.courses.length}
          name={manager.detail.name}
          onCancel={manager.closeArchive}
          onConfirm={manager.archive}
          pending={manager.statusPending}
          studentCount={manager.detail.studentCount}
        />
      ) : null}
      {canAssignCourses ? <CourseAssignmentDialog manager={manager} /> : null}
      {canEnroll ? <StudentEnrollmentDialog manager={manager} /> : null}
      {canAssignTeacher ? (
        <>
          <TeacherAssignmentDialog manager={manager} />
          <TeacherRemovalDialog manager={manager} />
        </>
      ) : null}
      <AccessRemovalDialog manager={manager} />
    </div>
  );
}

/** The same two fields as the create modal, saved against a class revision. */
function EditClassModal({
  manager,
}: {
  manager: ReturnType<typeof useClassDetailManager>;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const ready = manager.name.trim().length > 0;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeEdit();
      }}
      open={manager.editOpen}
    >
      <ModalContent
        description={t('edit_modal.body')}
        title={t('edit_modal.heading')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || manager.savePending) return;
            manager.saveDetails();
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.name_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={120}
                onChange={(event) => manager.setName(event.target.value)}
                placeholder={t('create.name_placeholder')}
                value={manager.name}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.description_label')}{' '}
                <span className="font-normal text-sub">
                  {t('create.description_optional')}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={2_000}
                onChange={(event) => manager.setDescription(event.target.value)}
                placeholder={t('create.description_placeholder')}
                value={manager.description}
              />
            </label>

            {manager.saveError ? (
              <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
                {errorText(manager.saveError, t('edit_modal.failed'))}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={manager.closeEdit}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || manager.savePending}
              type="submit"
            >
              {manager.savePending
                ? t('create.submitting')
                : t('edit_modal.submit')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
