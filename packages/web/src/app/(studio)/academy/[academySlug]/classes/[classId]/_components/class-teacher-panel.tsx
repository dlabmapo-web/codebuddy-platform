'use client';

import { AlertTriangle, GraduationCap, Mail, Plus, UserMinus } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  canEditAssignment,
  teacherAssignmentState,
  teacherDisplayName,
  unavailableReason,
} from '../_lib/teacher-assignment';
import { ClassPanel, ClassPanelEmpty } from './class-panel';

/**
 * Who is responsible for this class. At most one, possibly nobody, and
 * possibly somebody whose membership no longer backs the assignment.
 *
 * That third state is why the panel reports the membership rather than just a
 * name: suspending a teacher or moving them off the role revokes their access
 * immediately but deletes nothing, so the row that remains has to explain
 * itself instead of looking like working staffing.
 */
export function ClassTeacherPanel({
  canAssign,
  manager,
}: {
  canAssign: boolean;
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation('classes');
  const { detail } = manager;
  const teacher = detail.assignedTeacher;
  const editable = canEditAssignment({ canAssign, status: detail.status });
  const state = teacherAssignmentState(teacher);
  const effective = state === 'active';
  const name = teacherDisplayName(teacher, t('detail.teacher_panel.no_name'));

  return (
    <ClassPanel
      action={
        editable ? (
          // Brand blue, like "Assign courses" and "Add students": all three
          // panels have exactly one primary action, and they should look like
          // the same kind of thing. The teacher's own orange stays an identity
          // tint on the avatar and badge, never an action color.
          <Button onClick={manager.openTeacher} size="sm">
            {teacher ? <GraduationCap /> : <Plus />}
            {teacher
              ? t('detail.teacher_panel.replace')
              : t('detail.teacher_panel.assign')}
          </Button>
        ) : null
      }
      body={t('detail.teacher_panel.body')}
      // Zero or one, never a tally: the count communicates the cardinality the
      // whole feature is built around.
      count={teacher ? 1 : 0}
      heading={t('detail.teacher_panel.heading')}
    >
      {!teacher ? (
        <ClassPanelEmpty>
          {canAssign && detail.status === 'ARCHIVED'
            ? t('detail.teacher_panel.archived_readonly')
            : editable
              ? t('detail.teacher_panel.empty')
              : t('detail.teacher_panel.empty_readonly')}
        </ClassPanelEmpty>
      ) : (
        <div className="flex flex-wrap items-start gap-3 px-5 py-4">
          <span
            aria-hidden
            className={`grid size-11 shrink-0 place-items-center rounded-xl text-[16px] font-bold ${
              effective
                ? 'bg-primary-light text-primary'
                : 'bg-draft-soft text-draft'
            }`}
          >
            {name.trim().charAt(0).toUpperCase()}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold">{name}</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold ${
                  effective
                    ? 'bg-primary-light text-primary'
                    : 'bg-draft-soft text-draft'
                }`}
              >
                {effective ? null : <AlertTriangle className="size-3" />}
                {effective
                  ? t('detail.teacher_panel.role')
                  : t('detail.teacher_panel.unavailable')}
              </span>
            </div>

            {/* The email belongs to the detail page alone: the list gets by on
                a name, and a roster's worth of addresses is not free. */}
            <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-sub">
              <Mail aria-hidden className="size-3.5 shrink-0" />
              <span className={teacher.email ? '' : 'text-sub/60'}>
                {teacher.email ?? t('detail.teacher_panel.no_email')}
              </span>
            </p>

            <p
              className={`mt-1.5 max-w-prose text-[13px] leading-5 ${
                effective ? 'text-sub' : 'font-semibold text-draft'
              }`}
            >
              {effective
                ? t('detail.teacher_panel.active')
                : unavailableReason(teacher) === 'account'
                  ? t('detail.teacher_panel.unavailable_account')
                  : unavailableReason(teacher) === 'role'
                    ? t('detail.teacher_panel.unavailable_role')
                    : t('detail.teacher_panel.unavailable_suspended')}
            </p>

            {detail.status === 'ARCHIVED' && canAssign ? (
              <p className="mt-2 text-[13px] leading-5 text-sub">
                {t('detail.teacher_panel.archived_readonly')}
              </p>
            ) : null}
          </div>

          {editable ? (
            // Tinted rather than solid: it is destructive, so it must read as
            // destructive, but it is not the action the panel is asking for.
            // Filling it red would out-shout the primary button above it.
            <button
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-3.5 text-[13.5px] font-bold text-danger transition-colors hover:bg-danger hover:border-danger hover:text-on-danger disabled:opacity-40"
              disabled={manager.removalPending}
              onClick={() => manager.askRemoveTeacher(teacher, name)}
              type="button"
            >
              <UserMinus className="size-4" />
              {t('detail.teacher_panel.remove')}
            </button>
          ) : null}
        </div>
      )}
    </ClassPanel>
  );
}
