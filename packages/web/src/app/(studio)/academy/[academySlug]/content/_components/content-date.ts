'use client';

import { formatShortDate } from '@cove/i18n/format';

import { useLocale } from '@/i18n';

/** Table cells drop the year; the locale decides the rest. */
export function useContentDate(): (iso: string) => string {
  const locale = useLocale();
  return (iso: string) => formatShortDate(iso, locale);
}
