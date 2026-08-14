'use client';

import type { AppErrorCode } from '@cove/shared/errors';

import { useLayoutTranslation } from '@/i18n';
import { toApiError } from '@/lib/api-errors';

/**
 * Translate stable application codes first. Validation messages are safe,
 * caller-owned fallbacks come next, and server/internal messages stay hidden.
 */
/**
 * The same messages, addressed by code rather than by a thrown error.
 *
 * For the places that detect a failure locally and must name it the way the
 * API would have — a file the browser refuses before uploading it, so the
 * person reads one sentence whether the check ran here or on the server.
 */
export function useErrorCode() {
  const { t } = useLayoutTranslation('errors');
  return (code: AppErrorCode): string => t(code);
}

export function useErrorText() {
  const { t } = useLayoutTranslation('errors');

  return (error: unknown, fallback?: string): string => {
    const normalized = toApiError(error);
    if (normalized.code) return t(normalized.code);
    if (normalized.issues[0]?.message) return normalized.issues[0].message;
    return fallback ?? t('UNKNOWN');
  };
}
