import type {
  AssignedTeacherDetail,
  AssignedTeacherSummary,
  ClassTeacherDetail,
  EligibleTeacherSummary,
} from '@cove/shared';
import { assignmentGrantsAccess } from '@cove/shared';

/**
 * The decisions the teacher panel, list cell, and dialog all branch on, kept
 * out of the components so they can be checked without a DOM.
 *
 * The copy for each state lives in the `classes` namespace and is looked up by
 * the component, so this module stays free of user-visible strings.
 */

/**
 * Which of the three states a class is in.
 *
 * `unavailable` is the one worth naming: the class stores a teacher, but the
 * membership behind it no longer grants access. It is not the same as
 * unassigned — somebody still has to decide whether to replace or clear it.
 */
export type TeacherAssignmentState = 'none' | 'active' | 'unavailable';

/** Why an assignment grants nothing, which decides the explanation shown. */
export type UnavailableReason = 'account' | 'suspended' | 'role';

export function teacherAssignmentState(
  teacher: Pick<
    AssignedTeacherSummary,
    'membershipStatus' | 'roles' | 'userStatus'
  > | null,
): TeacherAssignmentState {
  if (!teacher) return 'none';
  return assignmentGrantsAccess(teacher) ? 'active' : 'unavailable';
}

/**
 * An active membership that no longer holds the `TEACHER` role failed for a
 * different reason than a suspended one, and the fix differs too.
 */
export function unavailableReason(
  teacher: Pick<
    AssignedTeacherSummary,
    'membershipStatus' | 'roles' | 'userStatus'
  >,
): UnavailableReason {
  if (teacher.userStatus !== 'ACTIVE') return 'account';
  return teacher.membershipStatus === 'ACTIVE' ? 'role' : 'suspended';
}

/**
 * Whether the panel offers any assignment control at all.
 *
 * Permission is only half of it: an archived class is read-only until it is
 * restored, for the same reason it grants no access while archived.
 */
export function canEditAssignment({
  canAssign,
  status,
}: {
  canAssign: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
}): boolean {
  return canAssign && status === 'ACTIVE';
}

/**
 * The name to show for a teacher. Falls back to the email before the "no name"
 * label, because an address still identifies the person and the label does not.
 */
export function teacherDisplayName(
  teacher: Pick<AssignedTeacherDetail, 'displayName' | 'email'> | null,
  fallback: string,
): string {
  return teacher?.displayName ?? teacher?.email ?? fallback;
}


/* ----------------------------------------------------------------- teachers */

/** Every teacher on the class, in the order the server sent them. */
export function currentTeacherIds(
  teachers: Pick<ClassTeacherDetail, 'membershipId'>[],
): string[] {
  return teachers.map((teacher) => teacher.membershipId);
}

/**
 * Whether saving the teachers would change anything. There is no limit on how
 * many; submitting the set already stored is refused here rather than sent as
 * a no-op, because the button would have promised a change it did not make.
 */
export function canSubmitTeachers({
  selectedIds,
  currentIds,
  pending,
}: {
  selectedIds: string[];
  currentIds: string[];
  pending: boolean;
}): boolean {
  if (pending) return false;
  const current = new Set(currentIds);
  return (
    selectedIds.length !== currentIds.length ||
    selectedIds.some((id) => !current.has(id))
  );
}

/** Search text for a teacher row, matching on either half of their identity. */
export function teacherSearchLabel(
  teacher: Pick<EligibleTeacherSummary, 'displayName' | 'email'>,
  fallback: string,
): string {
  return (
    [teacher.displayName, teacher.email].filter(Boolean).join(' · ') || fallback
  );
}
