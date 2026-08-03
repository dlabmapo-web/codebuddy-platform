import { ORPCError } from '@orpc/client';
import {
  isAppErrorCode,
  type AppErrorCode,
} from '@cove/shared/errors';

export type ApiErrorIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ApiErrorIssue[] = [],
    readonly code: AppErrorCode | null = null,
  ) {
    super(message);
  }
}

/** Normalize transport errors without exposing their messages to the UI. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ORPCError) {
    return new ApiError(
      error.message,
      error.status,
      extractIssues(error.data),
      extractAppErrorCode(error.code, error.data),
    );
  }

  return new ApiError(
    error instanceof Error ? error.message : 'Request failed',
    500,
  );
}

/**
 * Codes that mean "this identity may not open this thing". Anything else is a
 * real fault (schema drift, connection loss, a bug) and must not be reported to
 * the user as a permission or ownership problem.
 */
const accessDeniedCodes = new Set<AppErrorCode>([
  'AUTHENTICATION_REQUIRED',
  'TOKEN_INVALID',
  'PROFILE_INCOMPLETE',
  'USER_SUSPENDED',
  'ACADEMY_NOT_FOUND',
  'ACADEMY_MEMBERSHIP_REQUIRED',
  'ACADEMY_MEMBERSHIP_SUSPENDED',
  'PERMISSION_DENIED',
  'COURSE_NOT_FOUND',
  'EXERCISE_NOT_FOUND',
  'CONTENT_PARENT_MISMATCH',
]);

export function isAccessDeniedError(error: unknown): boolean {
  const { code, status } = toApiError(error);
  if (code) return accessDeniedCodes.has(code);
  // An untyped transport error only counts when the status itself says so.
  return status === 401 || status === 403 || status === 404;
}

export function extractAppErrorCode(
  transportCode: unknown,
  data: unknown,
): AppErrorCode | null {
  if (isAppErrorCode(transportCode)) return transportCode;
  if (isRecord(data) && isAppErrorCode(data.code)) return data.code;
  return null;
}

export function extractIssues(data: unknown): ApiErrorIssue[] {
  if (!isRecord(data) || !Array.isArray(data.issues)) return [];
  return data.issues.filter(isApiErrorIssue);
}

function isApiErrorIssue(value: unknown): value is ApiErrorIssue {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    typeof value.message === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
