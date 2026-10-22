'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@cove/i18n/locales/en/turtle-trial.json';
import ko from '@cove/i18n/locales/ko/turtle-trial.json';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';

export function useTurtleTranslation() {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['turtle-trial'], {
    en: { 'turtle-trial': en }, ko: { 'turtle-trial': ko },
  }), [locale]);
  return useTranslation('turtle-trial', { i18n: instance });
}
