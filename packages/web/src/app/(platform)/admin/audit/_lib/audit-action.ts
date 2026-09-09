/**
 * What kind of act an audit entry records, read from its own name.
 *
 * Every action on the platform is a dotted string ending in a verb —
 * `platform.academy.suspended`, `content.course.created`,
 * `academy.member.password.revealed`. That last segment is the only part that
 * says what happened, and it is the part a wall of `academy.feature.updated`
 * rows makes hardest to see.
 *
 * ## Why families rather than one colour per action
 *
 * There are sixty-odd actions and more arrive with every feature. A table
 * mapping each to a hue would be stale within a release and would say nothing
 * an operator could learn. Five families are learnable in one sitting, and the
 * distinction they draw is the one an audit trail exists for: somebody made
 * something, somebody changed something, somebody took something away,
 * something was destroyed — and, kept apart from all four, somebody merely
 * *looked*.
 *
 * Reads are their own family deliberately. `platform.audit.read` and
 * `platform.academy.deleted` are both entries in this log and they are not the
 * same kind of event; on a page where every row looked alike, that difference
 * was invisible.
 *
 * ## Why a suffix rule rather than a list
 *
 * A list of known actions would answer "unknown" for anything shipped after it
 * was written, which is every future feature. Matching the verb means a new
 * `content.module.created` is understood the day it exists — and an unfamiliar
 * verb falls back to `changed`, which is true of anything written to an audit
 * log.
 */
import type { TranslationKey } from '@/i18n';

export type AuditFamily =
  | 'created'
  | 'changed'
  | 'withdrawn'
  | 'destroyed'
  | 'read';

/**
 * Verbs per family, longest-match first within each list.
 *
 * Ordered so a compound verb cannot be claimed by a shorter one it contains:
 * `password.revealed` is a read, and would otherwise never be reached because
 * nothing else matches it.
 */
const familyVerbs: Record<AuditFamily, readonly string[]> = {
  destroyed: ['deleted', 'destroyed', 'purged', 'failed'],
  withdrawn: [
    'suspended',
    'archived',
    'retired',
    'revoked',
    'removed',
    'denied',
    'rejected',
    'ended',
    'paused',
  ],
  created: [
    'created',
    'granted',
    'issued',
    'invited',
    'accepted',
    'enrolled',
    'assigned',
    'restored',
    'imported',
    'opened',
  ],
  read: ['read', 'revealed', 'inspect', 'viewed', 'exported'],
  changed: [
    'updated',
    'update',
    'changed',
    'reordered',
    'replaced',
    'applied',
    'manage',
    'review',
    'resent',
    'lifecycle',
  ],
};

/** The verb an action ends in — its last dotted segment. */
export function auditVerb(action: string): string {
  const segments = action.split('.').filter(Boolean);
  return segments[segments.length - 1] ?? action;
}

/**
 * Everything before the verb, with its trailing dot.
 *
 * Returned rather than derived at the call site so the two halves cannot drift
 * apart: the row dims this and emphasises the verb, and a mismatch would drop
 * or duplicate a character in the middle of a name an operator searches by.
 */
export function auditNamespace(action: string): string {
  const verb = auditVerb(action);
  return action.length > verb.length ? action.slice(0, -verb.length) : '';
}

export function auditFamily(action: string): AuditFamily {
  const verb = auditVerb(action);
  for (const family of [
    'destroyed',
    'withdrawn',
    'read',
    'created',
  ] as const) {
    if (familyVerbs[family].includes(verb)) return family;
  }
  // `changed` last and unconditional: it is both the widest list and the
  // honest answer for a verb nothing above recognised.
  return 'changed';
}

/**
 * The sentence each action is written as, for a reader.
 *
 * The trail used to print the raw code — `class.courses.updated` — on the
 * argument that it is the vocabulary operators search by. That was true and
 * still is; it was not a good enough reason to make everybody read machine
 * notation. The code has not gone anywhere: it sits beside the sentence, in
 * mono, still exact, still the thing a filter matches.
 *
 * A table rather than a phrase composed from the parts. Composition sounds
 * cheaper until it meets a second language — Korean is not "subject" plus
 * "verb" with a space, and several of these are not literal readings of their
 * own name: `platform.support.granted` is a session being *opened*, and
 * `class.student.removed` needs to say which side the student left.
 *
 * Typed as `TranslationKey`, so every value here is checked against the
 * catalogue at build time: a key that does not exist fails to compile rather
 * than rendering its own name at an operator.
 *
 * An action with no entry — one shipped after this list — falls back to the
 * raw code, which is exactly what the page did before. Nothing regresses while
 * somebody adds a line.
 */
export const auditActionLabels: Record<string, TranslationKey<'platform-audit'>> = {
  'academy.feature.updated': 'action.academy.feature.updated',
  'academy.invitation.accepted': 'action.academy.invitation.accepted',
  'academy.invitation.created': 'action.academy.invitation.created',
  'academy.invitation.resent': 'action.academy.invitation.resent',
  'academy.invitation.revoked': 'action.academy.invitation.revoked',
  'academy.join_request.approved': 'action.academy.join_request.approved',
  'academy.join_request.rejected': 'action.academy.join_request.rejected',
  'academy.member.password.issued': 'action.academy.member.password.issued',
  'academy.member.password.revealed': 'action.academy.member.password.revealed',
  'academy.member_profile.image_removed': 'action.academy.member_profile.image_removed',
  'academy.member_profile.image_replaced': 'action.academy.member_profile.image_replaced',
  'academy.member_profile.updated': 'action.academy.member_profile.updated',
  'academy.membership.restored': 'action.academy.membership.restored',
  'academy.membership.role_changed': 'action.academy.membership.role_changed',
  'academy.membership.role_granted': 'action.academy.membership.role_granted',
  'academy.membership.role_revoked': 'action.academy.membership.role_revoked',
  'academy.membership.suspended': 'action.academy.membership.suspended',
  'academy.people.bulk.enroll': 'action.academy.people.bulk.enroll',
  'academy.people.bulk.restore': 'action.academy.people.bulk.restore',
  'academy.people.bulk.role_change': 'action.academy.people.bulk.role_change',
  'academy.people.bulk.suspend': 'action.academy.people.bulk.suspend',
  'academy.people.imported': 'action.academy.people.imported',
  'academy.point_policy.reset': 'action.academy.point_policy.reset',
  'academy.point_policy.updated': 'action.academy.point_policy.updated',
  'academy.profile.media_removed': 'action.academy.profile.media_removed',
  'academy.profile.update': 'action.academy.profile.update',
  'class.archived': 'action.class.archived',
  'class.assistants.updated': 'action.class.assistants.updated',
  'class.courses.updated': 'action.class.courses.updated',
  'class.created': 'action.class.created',
  'class.deleted': 'action.class.deleted',
  'class.restored': 'action.class.restored',
  'class.schedule.updated': 'action.class.schedule.updated',
  'class.student.removed': 'action.class.student.removed',
  'class.students.enrolled': 'action.class.students.enrolled',
  'class.teacher.assigned': 'action.class.teacher.assigned',
  'class.teacher.removed': 'action.class.teacher.removed',
  'class.teacher.replaced': 'action.class.teacher.replaced',
  'class.updated': 'action.class.updated',
  'content.course.adopted_from_library': 'action.content.course.adopted_from_library',
  'content.course.content_visibility_changed': 'action.content.course.content_visibility_changed',
  'content.course.created': 'action.content.course.created',
  'content.course.deleted': 'action.content.course.deleted',
  'content.course.updated': 'action.content.course.updated',
  'content.course.visibility_changed': 'action.content.course.visibility_changed',
  'content.course_module.created': 'action.content.course_module.created',
  'content.course_module.deleted': 'action.content.course_module.deleted',
  'content.course_module.reordered': 'action.content.course_module.reordered',
  'content.course_module.updated': 'action.content.course_module.updated',
  'content.course_module.visibility_changed': 'action.content.course_module.visibility_changed',
  'content.curriculum_import.committed': 'action.content.curriculum_import.committed',
  'content.lecture.created': 'action.content.lecture.created',
  'content.lecture.deleted': 'action.content.lecture.deleted',
  'content.lecture.reordered': 'action.content.lecture.reordered',
  'content.lecture.updated': 'action.content.lecture.updated',
  'content.lecture.visibility_changed': 'action.content.lecture.visibility_changed',
  'content.programming_exercise.created': 'action.content.programming_exercise.created',
  'content.programming_exercise.deleted': 'action.content.programming_exercise.deleted',
  'content.programming_exercise.reordered': 'action.content.programming_exercise.reordered',
  'content.programming_exercise.updated': 'action.content.programming_exercise.updated',
  'content.programming_exercise.visibility_changed': 'action.content.programming_exercise.visibility_changed',
  'monitoring.exercise_solution.viewed': 'action.monitoring.exercise_solution.viewed',
  'platform.academy.archived': 'action.platform.academy.archived',
  'platform.academy.created': 'action.platform.academy.created',
  'platform.academy.deleted': 'action.platform.academy.deleted',
  'platform.academy.first_manager_invitation_resent': 'action.platform.academy.first_manager_invitation_resent',
  'platform.academy.first_manager_invited': 'action.platform.academy.first_manager_invited',
  'platform.academy.restored': 'action.platform.academy.restored',
  'platform.academy.suspended': 'action.platform.academy.suspended',
  'platform.academy.updated': 'action.platform.academy.updated',
  'platform.admin.granted': 'action.platform.admin.granted',
  'platform.library.course.created': 'action.platform.library.course.created',
  'platform.library.course.restored': 'action.platform.library.course.restored',
  'platform.library.course.retired': 'action.platform.library.course.retired',
  'platform.library.created': 'action.platform.library.created',
  'platform.organization.created': 'action.platform.organization.created',
  'platform.regrade.completed': 'action.platform.regrade.completed',
  'platform.regrade.planned': 'action.platform.regrade.planned',
  'platform.regrade.started': 'action.platform.regrade.started',
  'platform.support.granted': 'action.platform.support.granted',
  'platform.support.revoked': 'action.platform.support.revoked',
  'platform.user.deleted': 'action.platform.user.deleted',
  'platform.user.operator_granted': 'action.platform.user.operator_granted',
  'platform.user.operator_revoked': 'action.platform.user.operator_revoked',
  'platform.user.participation.read': 'action.platform.user.participation.read',
  'platform.user.restored': 'action.platform.user.restored',
  'platform.user.suspended': 'action.platform.user.suspended',
  'platform.users.exported': 'action.platform.users.exported',
};

/** The label key for an action, or null when nobody has written one yet. */
export function auditActionLabel(
  action: string,
): TranslationKey<'platform-audit'> | null {
  return auditActionLabels[action] ?? null;
}
