'use client';

import { useLayoutTranslation } from '@/i18n';
import { toApiError } from '@/lib/api-errors';

/**
 * Translate stable application codes first. Validation messages are safe,
 * caller-owned fallbacks come next, and server/internal messages stay hidden.
 */
export function useErrorText() {
  const { t } = useLayoutTranslation('errors');

  return (error: unknown, fallback?: string): string => {
    const normalized = toApiError(error);
    if (normalized.code) return t(normalized.code);
    if (normalized.issues[0]?.message) return normalized.issues[0].message;
    return fallback ?? t('UNKNOWN');
  };
}
