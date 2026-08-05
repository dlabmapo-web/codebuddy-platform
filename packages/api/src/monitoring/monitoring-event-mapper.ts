import { isAppErrorCode, type AppErrorCode } from "@cove/shared";

import { AppException } from "../common/app-exception.js";

/**
 * The boundary between what went wrong and what a client is told.
 *
 * A socket acknowledgement has no HTTP status to fall back on, so every
 * failure has to be reduced to a public code here. Anything unrecognized
 * becomes a generic denial rather than leaking a Prisma constraint name, a
 * Redis key, or a stack trace into a browser.
 */
export function toPublicErrorCode(error: unknown): AppErrorCode {
  if (error instanceof AppException) return error.code;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    isAppErrorCode((error as { code: unknown }).code)
  ) {
    return (error as { code: AppErrorCode }).code;
  }
  return "MONITORING_ACCESS_DENIED";
}

/**
 * What may be written about a monitoring event.
 *
 * Ids, reasons, durations, and sizes. Never a token, a name, an email, source
 * code, a feedback body, Yjs bytes, stdout, or a coordinate — the log is
 * operational, and none of those make it more so.
 */
export type MonitoringLogFields = {
  event: string;
  academyId?: string;
  classId?: string;
  membershipId?: string;
  draftId?: string;
  reason?: string;
  durationMs?: number;
  bytes?: number;
};

export function monitoringLogLine(fields: MonitoringLogFields): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}
