'use client';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@cove/i18n/locales/en/monitoring.json';
import ko from '@cove/i18n/locales/ko/monitoring.json';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';
export function useObservationTranslation() {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['monitoring'], { en: { monitoring: en }, ko: { monitoring: ko } }), [locale]);
  return useTranslation('monitoring', { i18n: instance });
}
