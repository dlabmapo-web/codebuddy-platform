import { z } from "zod";

export const appErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "TOKEN_INVALID",
  "STUDENT_SESSION_EXPIRED",
  "STUDENT_SESSION_UNAVAILABLE",
  "PROFILE_INCOMPLETE",
  "USER_SUSPENDED",
  "EMAIL_VERIFICATION_REQUIRED",
  "ACADEMY_NOT_FOUND",
  "ACADEMY_MEMBERSHIP_REQUIRED",
  "ACADEMY_MEMBERSHIP_SUSPENDED",
  "PERMISSION_DENIED",
  "INVITATION_INVALID",
  "INVITATION_EXPIRED",
  "INVITATION_EMAIL_MISMATCH",
  "INVITATION_ALREADY_PENDING",
  "JOIN_REQUEST_ALREADY_PENDING",
  "JOIN_REQUEST_NOT_FOUND",
  "JOIN_REQUEST_STATE_CONFLICT",
  "JOIN_REQUEST_ROLE_NOT_PERMITTED",
  "MEMBERSHIP_ALREADY_EXISTS",
  "MEMBERSHIP_STATE_CONFLICT",
  "RATE_LIMITED",
  "OAUTH_ONBOARDING_INTENT_REQUIRED",
  "OAUTH_ONBOARDING_INTENT_INVALID",
  "OAUTH_ONBOARDING_INTENT_EXPIRED",
  "OAUTH_ONBOARDING_INTENT_CONSUMED",
  "OAUTH_PROVIDER_MISMATCH",
  "LAST_MANAGER_REQUIRED",
  "IDENTITY_LINK_CONFLICT",
  "USERNAME_TAKEN",
  "USERNAME_ALREADY_SET",
  "LEGACY_ACCOUNT_ALREADY_MIGRATED",
  "COURSE_NOT_FOUND",
  "COURSE_TITLE_CONFLICT",
  "CONTENT_PARENT_MISMATCH",
  "CONTENT_POSITION_CONFLICT",
  "CONTENT_VALIDATION_FAILED",
  "EXERCISE_NOT_FOUND",
  "EXERCISE_VALIDATION_FAILED",
  "CONTENT_EDIT_CONFLICT",
  "CONTENT_HAS_SUBMISSIONS",
  "EXERCISE_NOT_AVAILABLE",
  "CLASS_NOT_FOUND",
  "CLASS_ARCHIVED",
  "CLASS_EDIT_CONFLICT",
  "CLASS_VALIDATION_FAILED",
  "CLASS_MEMBERSHIP_INELIGIBLE",
  "CLASS_TEACHER_INELIGIBLE",
  "COURSE_NOT_ASSIGNED",
  "DRAFT_TOO_LARGE",
  "SUBMISSION_IN_FLIGHT",
  "SUBMISSION_RATE_LIMITED",
  "SUBMISSION_NOT_FOUND",
  "SOLVE_SESSION_INVALID",
  "GRADING_UNAVAILABLE",
  "MONITORING_DISABLED",
  "MONITORING_ACCESS_DENIED",
  "MONITORING_STUDENT_UNAVAILABLE",
  "MONITORING_WATCH_REPLACED",
  "MONITORING_PAYLOAD_TOO_LARGE",
  "MONITORING_REALTIME_UNAVAILABLE",
  "MONITORING_FEEDBACK_INVALID",
  "TEACHER_PROGRESS_ACCESS_DENIED",
  "TEACHER_PROGRESS_NOT_FOUND",
  "TEACHER_OVERVIEW_ACCESS_DENIED",
  "STUDENT_OVERVIEW_ACCESS_DENIED",
  "POINTS_ACCESS_DENIED",
  "POINTS_UNAVAILABLE",
  "MANAGER_OPERATIONS_ACCESS_DENIED",
  "CURRICULUM_OVERVIEW_ACCESS_DENIED",
  "IMPORT_FILE_REJECTED",
  "IMPORT_SESSION_NOT_FOUND",
  "IMPORT_PREVIEW_EXPIRED",
  "IMPORT_NOT_COMMITTABLE",
  "IMPORT_IN_PROGRESS",
  "CONTENT_IMPORT_FILE_REJECTED",
  "CONTENT_IMPORT_TEMPLATE_UNSUPPORTED",
  "CONTENT_IMPORT_SESSION_NOT_FOUND",
  "CONTENT_IMPORT_PREVIEW_EXPIRED",
  "CONTENT_IMPORT_NOT_COMMITTABLE",
  "CONTENT_IMPORT_IN_PROGRESS",
  "CONTENT_IMPORT_REVISION_CONFLICT",
  "CONTENT_IMPORT_PARENT_CONFLICT",
  "CONTENT_IMPORT_KEY_CONFLICT",
  "CONTENT_IMPORT_ORDER_CONFLICT",
  "CONTENT_IMPORT_VALIDATION_FAILED",
  "PEOPLE_REVISION_CONFLICT",
  "BULK_OPERATION_IN_PROGRESS",
  "BULK_SELECTION_EMPTY",
  "PROFILE_NOT_FOUND",
  "PROFILE_CHANGED",
  "PROFILE_VALIDATION_FAILED",
  "PROFILE_NUMBER_CONFLICT",
  "PROFILE_IMAGE_TYPE_INVALID",
  "PROFILE_IMAGE_TOO_LARGE",
  "PROFILE_IMAGE_DECODE_FAILED",
  "PROFILE_IMAGE_STORAGE_FAILED",
  "ACADEMY_MEDIA_ALT_REQUIRED",
  "ACADEMY_MEDIA_LIMIT_REACHED",
  "ACADEMY_MEDIA_NOT_FOUND",
  "PLATFORM_ACCESS_DENIED",
  "ACADEMY_SLUG_CONFLICT",
  "ACADEMY_STATE_CONFLICT",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

/**
 * The same vocabulary as a schema, for payloads that carry a failure rather
 * than throwing one — a socket acknowledgement has no HTTP status to lean on.
 */
export const appErrorCodeSchema = z.enum(appErrorCodes);

const appErrorCodeSet = new Set<string>(appErrorCodes);

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === "string" && appErrorCodeSet.has(value);
}

export const appErrorFallbacks: Record<AppErrorCode, string> = {
  POINTS_ACCESS_DENIED: "You do not have access to these points.",
  POINTS_UNAVAILABLE: "This academy does not use points.",
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  TOKEN_INVALID: "The session is invalid or expired.",
  STUDENT_SESSION_EXPIRED: "Your student session expired. Sign in again.",
  STUDENT_SESSION_UNAVAILABLE:
    "Student sessions are temporarily unavailable. Sign in again shortly.",
  PROFILE_INCOMPLETE: "Complete your profile to continue.",
  USER_SUSPENDED: "This account is suspended.",
  EMAIL_VERIFICATION_REQUIRED: "Verify your email to continue.",
  ACADEMY_NOT_FOUND: "The selected academy is not available.",
  ACADEMY_MEMBERSHIP_REQUIRED: "Academy membership is required.",
  ACADEMY_MEMBERSHIP_SUSPENDED: "This academy membership is suspended.",
  PERMISSION_DENIED: "You do not have permission to perform this action.",
  INVITATION_INVALID: "This invitation is invalid.",
  INVITATION_EXPIRED: "This invitation has expired.",
  INVITATION_EMAIL_MISMATCH: "Sign in with the invited email address.",
  INVITATION_ALREADY_PENDING: "An invitation is already pending for this email.",
  JOIN_REQUEST_ALREADY_PENDING: "A join request is already pending.",
  JOIN_REQUEST_NOT_FOUND: "The join request was not found.",
  JOIN_REQUEST_STATE_CONFLICT: "The join request has already been reviewed.",
  JOIN_REQUEST_ROLE_NOT_PERMITTED:
    "You can only approve applicants as a student or a teacher.",
  MEMBERSHIP_ALREADY_EXISTS: "This user already belongs to the academy.",
  MEMBERSHIP_STATE_CONFLICT: "The membership cannot make that transition.",
  RATE_LIMITED: "Too many requests. Try again later.",
  OAUTH_ONBOARDING_INTENT_REQUIRED: "Choose an academy before social signup.",
  OAUTH_ONBOARDING_INTENT_INVALID: "The social signup request is invalid.",
  OAUTH_ONBOARDING_INTENT_EXPIRED: "The social signup request has expired.",
  OAUTH_ONBOARDING_INTENT_CONSUMED: "The social signup request was already used.",
  OAUTH_PROVIDER_MISMATCH: "The social provider does not match this signup request.",
  LAST_MANAGER_REQUIRED: "The academy must keep at least one active manager.",
  IDENTITY_LINK_CONFLICT: "This identity cannot be linked automatically.",
  USERNAME_TAKEN: "That username is already taken.",
  USERNAME_ALREADY_SET: "This account already has a username.",
  LEGACY_ACCOUNT_ALREADY_MIGRATED: "This legacy account is already migrated.",
  COURSE_NOT_FOUND: "The selected course was not found.",
  COURSE_TITLE_CONFLICT: "A course already uses this title.",
  CONTENT_PARENT_MISMATCH: "The content does not belong to the selected parent.",
  CONTENT_POSITION_CONFLICT: "Two content items cannot use the same position.",
  CONTENT_VALIDATION_FAILED: "Fix the content validation issues and try again.",
  EXERCISE_NOT_FOUND: "The selected programming problem was not found.",
  EXERCISE_VALIDATION_FAILED: "Complete the required problem fields and try again.",
  CONTENT_EDIT_CONFLICT: "This problem changed in another session. Reload it before saving again.",
  CONTENT_HAS_SUBMISSIONS: "This content has student submissions. Hide it instead of deleting it.",
  EXERCISE_NOT_AVAILABLE: "This problem is not available.",
  CLASS_NOT_FOUND: "The selected class was not found.",
  CLASS_ARCHIVED: "This class is archived. Restore it before changing it.",
  CLASS_EDIT_CONFLICT: "This class changed in another session. Reload it before saving again.",
  CLASS_VALIDATION_FAILED: "Fix the class details and try again.",
  CLASS_MEMBERSHIP_INELIGIBLE: "Only active students of this academy can be enrolled.",
  // Deliberately one message for every eligibility failure: a caller must not
  // be able to tell a suspended teacher from one in another academy.
  CLASS_TEACHER_INELIGIBLE: "Only an active teacher of this academy can be assigned to a class.",
  COURSE_NOT_ASSIGNED: "This course is not available to you.",
  DRAFT_TOO_LARGE: "Your code is too large to save.",
  SUBMISSION_IN_FLIGHT: "This problem is already being graded. Wait for the result.",
  SUBMISSION_RATE_LIMITED: "Too many submissions. Wait a moment and try again.",
  SUBMISSION_NOT_FOUND: "That submission was not found.",
  SOLVE_SESSION_INVALID:
    "This problem session expired. Please submit again.",
  GRADING_UNAVAILABLE: "Grading is temporarily unavailable. Your code is saved.",
  MONITORING_DISABLED: "Live monitoring is not enabled for this academy.",
  // One message for every access failure — not assigned, wrong academy,
  // archived class, suspended membership — so a caller cannot learn which
  // classes or students exist by reading the error.
  MONITORING_ACCESS_DENIED: "You are not the assigned teacher for this class.",
  MONITORING_STUDENT_UNAVAILABLE: "This student is not available to monitor right now.",
  MONITORING_WATCH_REPLACED: "This session was replaced by a newer one.",
  MONITORING_PAYLOAD_TOO_LARGE: "That change was too large to send.",
  MONITORING_REALTIME_UNAVAILABLE: "Live monitoring is temporarily unavailable.",
  MONITORING_FEEDBACK_INVALID: "Feedback must be between 1 and 2,000 characters.",
  // The same one message for every access failure, for the same reason as
  // monitoring: a teacher must not be able to map another academy's classes
  // by reading which error comes back.
  TEACHER_PROGRESS_ACCESS_DENIED:
    "You are not the assigned teacher for this class.",
  // Never existed, no longer in this class, or no longer visible — one answer,
  // so the API cannot be used as an existence oracle.
  TEACHER_PROGRESS_NOT_FOUND: "That is no longer part of this class.",
  // The academy overview reads across every assigned class at once, so its
  // denial says nothing about which of them exist either.
  TEACHER_OVERVIEW_ACCESS_DENIED:
    "You do not have a teaching overview for this academy.",
  // The student overview is about one person, and that person is always the
  // caller. Staff keep their own overview rather than receiving a narrower
  // version of this one, so the denial says nothing about the academy either.
  STUDENT_OVERVIEW_ACCESS_DENIED:
    "You do not have a learning overview for this academy.",
  // The manager surfaces read across the whole academy, so one code covers no
  // membership, a suspended one, the wrong role, and another academy's id.
  MANAGER_OPERATIONS_ACCESS_DENIED:
    "You are not an active manager of this academy.",
  // The curriculum overview reads across every course and class in the academy,
  // so one code covers no membership, a suspended one, the wrong role — a
  // Manager included, who keeps the control tower — and another academy's id.
  CURRICULUM_OVERVIEW_ACCESS_DENIED:
    "You are not an active team lead of this academy.",
  // The workbook itself, before any row was judged. The specific reason
  // travels as the exception's detail so the interface can name it.
  IMPORT_FILE_REJECTED: "That file could not be read as a member list.",
  // One code for "no such session" and "another academy's session", so a
  // manager cannot confirm another academy's imports exist.
  IMPORT_SESSION_NOT_FOUND: "That import is no longer available.",
  IMPORT_PREVIEW_EXPIRED:
    "This preview has expired. Upload the file again to see current results.",
  IMPORT_NOT_COMMITTABLE:
    "Fix the errors and acknowledge the warnings before importing.",
  IMPORT_IN_PROGRESS: "This import is already running.",
  // The curriculum importer's own family. Kept separate from the member one
  // rather than widened: the two features share a shape and nothing else, and a
  // single IMPORT_SESSION_NOT_FOUND covering both would make a member session
  // and a course session interchangeable in every scope check that reads it.
  CONTENT_IMPORT_FILE_REJECTED: "That file could not be read as a course workbook.",
  CONTENT_IMPORT_TEMPLATE_UNSUPPORTED:
    "This workbook was made for a different template version. Download the workbook again.",
  // One code for a missing session, another course's, and another academy's, so
  // a team lead cannot confirm that an id belongs to somebody else's import.
  CONTENT_IMPORT_SESSION_NOT_FOUND: "That import is no longer available.",
  CONTENT_IMPORT_PREVIEW_EXPIRED:
    "This preview has expired. Upload the workbook again to see current results.",
  CONTENT_IMPORT_NOT_COMMITTABLE:
    "Resolve the conflicts and acknowledge the warnings before importing.",
  CONTENT_IMPORT_IN_PROGRESS: "This import is already running.",
  // The course moved while the preview was on screen. Never resolved by
  // overwriting: the team lead uploads again and reviews the new plan.
  CONTENT_IMPORT_REVISION_CONFLICT:
    "The course changed while you were reviewing. Upload the workbook again.",
  CONTENT_IMPORT_PARENT_CONFLICT:
    "Import cannot move existing content to another module or lecture.",
  CONTENT_IMPORT_KEY_CONFLICT: "Two rows use the same key.",
  CONTENT_IMPORT_ORDER_CONFLICT: "Two rows claim the same position.",
  CONTENT_IMPORT_VALIDATION_FAILED:
    "Fix the issues listed in the preview and upload the workbook again.",
  // The roster moved while a preview or a selection was on screen. Never
  // resolved by overwriting: the manager re-reads and decides again.
  PEOPLE_REVISION_CONFLICT:
    "The member list changed while you were working. Reload and try again.",
  BULK_OPERATION_IN_PROGRESS: "That bulk operation is already running.",
  BULK_SELECTION_EMPTY: "Nobody in the current selection can be changed.",
  // One answer for "no such membership", "not yours", and "not in your
  // academy": a manager must not be able to enumerate another academy's
  // members by reading which failure comes back.
  PROFILE_NOT_FOUND: "That profile is not available to you.",
  // The draft is kept in the browser when this arrives — a student and their
  // manager can be editing the same row, and neither one should lose work.
  PROFILE_CHANGED:
    "This profile changed somewhere else. Reload it before saving again.",
  PROFILE_VALIDATION_FAILED: "Check the highlighted fields and try again.",
  // Deliberately silent about who holds the number: uniqueness is academy-
  // local, and the message must not leak a roster.
  PROFILE_NUMBER_CONFLICT: "That number is already used in this academy.",
  PROFILE_IMAGE_TYPE_INVALID: "Choose a JPEG, PNG, or WebP image.",
  PROFILE_IMAGE_TOO_LARGE: "Choose an image smaller than 5 MB.",
  PROFILE_IMAGE_DECODE_FAILED: "That image could not be read. Try another file.",
  // The previous photo is still in place when this arrives; nothing was lost.
  PROFILE_IMAGE_STORAGE_FAILED:
    "The image could not be saved. Your previous photo is unchanged.",
  ACADEMY_MEDIA_ALT_REQUIRED: "Describe the image or mark it as decorative.",
  ACADEMY_MEDIA_LIMIT_REACHED: "The academy gallery already has six images.",
  PLATFORM_ACCESS_DENIED: "This area is not available for your account.",
  ACADEMY_SLUG_CONFLICT: "That academy address is already taken.",
  ACADEMY_STATE_CONFLICT:
    "This academy cannot move to that state from its current one.",
  ACADEMY_MEDIA_NOT_FOUND: "That academy image is not available.",
};
