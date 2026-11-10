'use client';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@cove/i18n/locales/en/explanation.json';
import ko from '@cove/i18n/locales/ko/explanation.json';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';
export function useExplanationTranslation() {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['explanation'], { en: { explanation: en }, ko: { explanation: ko } }), [locale]);
  return useTranslation('explanation', { i18n: instance });
}
