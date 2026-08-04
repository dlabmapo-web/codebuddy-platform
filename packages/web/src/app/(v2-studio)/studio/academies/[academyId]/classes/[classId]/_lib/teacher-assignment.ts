import type { AssignedTeacherDetail, AssignedTeacherSummary } from '@cove/shared';
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
    'membershipStatus' | 'role' | 'userStatus'
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
    'membershipStatus' | 'role' | 'userStatus'
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
 * Whether saving is allowed for the current dialog selection.
 *
 * Re-saving the teacher already assigned is refused here rather than sent as a
 * no-op: the API would accept it, but the button would have promised a change
 * it did not make.
 */
export function canSubmitTeacherSelection({
  selectedId,
  currentId,
  pending,
}: {
  selectedId: string | null;
  currentId: string | null;
  pending: boolean;
}): boolean {
  if (pending || selectedId === null) return false;
  return selectedId !== currentId;
}

/**
 * Whether saving would displace somebody. Reopening the dialog on the current
 * teacher must not warn about replacing them with themselves.
 */
export function isReplacement({
  selectedId,
  currentId,
}: {
  selectedId: string | null;
  currentId: string | null;
}): boolean {
  return currentId !== null && selectedId !== null && selectedId !== currentId;
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
