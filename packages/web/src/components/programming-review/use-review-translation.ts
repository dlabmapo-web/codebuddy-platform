'use client';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';
import en from '@cove/i18n/locales/en/programming-review.json';
import ko from '@cove/i18n/locales/ko/programming-review.json';
export function useReviewTranslation() {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['programming-review'], {
    en: {'programming-review': en}, ko: {'programming-review': ko},
  }), [locale]);
  return useTranslation('programming-review', {i18n: instance}).t;
}
