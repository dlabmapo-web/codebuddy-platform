export const appErrorCodes = [
  "AUTHENTICATION_REQUIRED",
  "TOKEN_INVALID",
  "PROFILE_INCOMPLETE",
  "USER_SUSPENDED",
  "EMAIL_VERIFICATION_REQUIRED",
  "ACADEMY_MEMBERSHIP_REQUIRED",
  "ACADEMY_MEMBERSHIP_SUSPENDED",
  "PERMISSION_DENIED",
  "INVITATION_INVALID",
  "INVITATION_EXPIRED",
  "INVITATION_EMAIL_MISMATCH",
  "JOIN_REQUEST_ALREADY_PENDING",
  "LAST_MANAGER_REQUIRED",
  "IDENTITY_LINK_CONFLICT",
  "LEGACY_ACCOUNT_ALREADY_MIGRATED",
] as const;

export type AppErrorCode = (typeof appErrorCodes)[number];

export const appErrorFallbacks: Record<AppErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  TOKEN_INVALID: "The session is invalid or expired.",
  PROFILE_INCOMPLETE: "Complete your profile to continue.",
  USER_SUSPENDED: "This account is suspended.",
  EMAIL_VERIFICATION_REQUIRED: "Verify your email to continue.",
  ACADEMY_MEMBERSHIP_REQUIRED: "Academy membership is required.",
  ACADEMY_MEMBERSHIP_SUSPENDED: "This academy membership is suspended.",
  PERMISSION_DENIED: "You do not have permission to perform this action.",
  INVITATION_INVALID: "This invitation is invalid.",
  INVITATION_EXPIRED: "This invitation has expired.",
  INVITATION_EMAIL_MISMATCH: "Sign in with the invited email address.",
  JOIN_REQUEST_ALREADY_PENDING: "A join request is already pending.",
  LAST_MANAGER_REQUIRED: "The academy must keep at least one active manager.",
  IDENTITY_LINK_CONFLICT: "This identity cannot be linked automatically.",
  LEGACY_ACCOUNT_ALREADY_MIGRATED: "This legacy account is already migrated.",
};
