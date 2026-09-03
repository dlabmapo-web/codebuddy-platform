'use client';

import type { ClassTeacherDetail } from '@cove/shared';
import {
  AlertTriangle,
  GraduationCap,
  Mail,
  Plus,
  UserMinus,
  UserPlus,
} from 'lucide-react';

import { Button } from '@/components/studio/button';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation } from '@/i18n';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import {
  assistantSlotsLeft,
  canEditAssignment,
  currentAssistantIds,
  teacherAssignmentState,
  teacherDisplayName,
  unavailableReason,
} from '../_lib/teacher-assignment';
import { ClassPanel, ClassPanelEmpty } from './class-panel';

/**
 * Who teaches this class: one homeroom teacher, and up to two assistants
 * beside them.
 *
 * The two are one list rather than two panels because they are the same fact —
 * a manager asking "who teaches Level 1" wants one answer. What separates them
 * is the badge and what removing them does: clearing the homeroom teacher
 * leaves the class running unassigned, while dropping an assistant leaves the
 * class staffed exactly as before.
 *
 * A teacher can also read as unavailable, which is why each row reports the
 * membership rather than just a name: suspending somebody or moving them off
 * the role revokes their access immediately but deletes nothing, so the row
 * that remains has to explain itself instead of looking like working staffing.
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
  const homeroom = detail.assignedTeacher;
  const editable = canEditAssignment({ canAssign, status: detail.status });
  const slotsLeft = assistantSlotsLeft(currentAssistantIds(detail.teachers).length);

  return (
    <ClassPanel
      action={
        editable ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Adding help is secondary to naming who is answerable, so it is
                the outlined one of the two. */}
            <Button
              disabled={slotsLeft === 0}
              onClick={manager.openAssistants}
              size="sm"
              variant="outline"
            >
              <UserPlus />
              {t('detail.teacher_panel.manage_assistants')}
            </Button>
            {/* Brand blue, like "Assign courses" and "Add students": all three
                panels have exactly one primary action, and they should look
                like the same kind of thing. The teacher's own orange stays an
                identity tint on the avatar and badge, never an action color. */}
            <Button onClick={manager.openTeacher} size="sm">
              {homeroom ? <GraduationCap /> : <Plus />}
              {homeroom
                ? t('detail.teacher_panel.replace')
                : t('detail.teacher_panel.assign')}
            </Button>
          </div>
        ) : null
      }
      body={t('detail.teacher_panel.body')}
      count={detail.teachers.length}
      heading={t('detail.teacher_panel.heading')}
    >
      {detail.teachers.length === 0 ? (
        <ClassPanelEmpty>
          {canAssign && detail.status === 'ARCHIVED'
            ? t('detail.teacher_panel.archived_readonly')
            : editable
              ? t('detail.teacher_panel.empty')
              : t('detail.teacher_panel.empty_readonly')}
        </ClassPanelEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {detail.teachers.map((teacher) => (
            <TeacherRow
              canAssign={canAssign}
              editable={editable}
              key={teacher.membershipId}
              manager={manager}
              teacher={teacher}
            />
          ))}
        </ul>
      )}
    </ClassPanel>
  );
}

/**
 * One teacher. Identical for both kinds except the badge and which removal it
 * asks for — the same person in either seat teaches the class the same way.
 */
function TeacherRow({
  canAssign,
  editable,
  manager,
  teacher,
}: {
  canAssign: boolean;
  editable: boolean;
  manager: ClassDetailManagerState;
  teacher: ClassTeacherDetail;
}) {
  const { t } = useLayoutTranslation('classes');
  const state = teacherAssignmentState(teacher);
  const effective = state === 'active';
  const name = teacherDisplayName(teacher, t('detail.teacher_panel.no_name'));

  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4">
      {/* The person's own photo, like every other place a member is listed.
          A hand-drawn initial here could never show one, so a teacher who had
          uploaded a picture was the only member on the page without a face. */}
      <ProfileAvatar
        academyImageUrl={teacher.academyImageUrl}
        className={effective ? undefined : 'opacity-60'}
        externalAvatarUrl={teacher.externalAvatarUrl}
        globalImageUrl={teacher.globalImageUrl}
        name={teacher.displayName}
        size="md"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold">{name}</span>
          {/* Which seat, always — a class with three teachers is unreadable
              without saying which one is answerable for it. */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold ${
              teacher.isHomeroom
                ? 'bg-primary-light text-primary'
                : 'bg-canvas text-sub'
            }`}
          >
            {teacher.isHomeroom
              ? t('detail.teacher_panel.homeroom')
              : t('detail.teacher_panel.assistant')}
          </span>
          {effective ? null : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-draft-soft px-2 py-0.5 text-[12px] font-bold text-draft">
              <AlertTriangle className="size-3" />
              {t('detail.teacher_panel.unavailable')}
            </span>
          )}
        </div>

        {/* The email belongs to the detail page alone: the list gets by on a
            name, and a roster's worth of addresses is not free. */}
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
            ? teacher.isHomeroom
              ? t('detail.teacher_panel.active')
              : t('detail.teacher_panel.active_assistant')
            : unavailableReason(teacher) === 'account'
              ? t('detail.teacher_panel.unavailable_account')
              : unavailableReason(teacher) === 'role'
                ? t('detail.teacher_panel.unavailable_role')
                : t('detail.teacher_panel.unavailable_suspended')}
        </p>

        {teacher.isHomeroom && manager.detail.status === 'ARCHIVED' && canAssign ? (
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
          onClick={() =>
            teacher.isHomeroom
              ? manager.askRemoveTeacher(teacher, name)
              : manager.askRemoveAssistant(teacher, name)
          }
          type="button"
        >
          <UserMinus className="size-4" />
          {t('detail.teacher_panel.remove')}
        </button>
      ) : null}
    </li>
  );
}
