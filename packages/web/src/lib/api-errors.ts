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
