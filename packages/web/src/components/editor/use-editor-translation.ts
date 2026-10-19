'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@cove/i18n/locales/en/editor.json';
import ko from '@cove/i18n/locales/ko/editor.json';
import { useLocale } from '@/i18n';
import { initTranslationsSync } from '@/i18n/init-translations';

/** Editor controls load their own vocabulary without enlarging the root layout. */
export function useEditorTranslation() {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['editor'], {
    en: { editor: en }, ko: { editor: ko },
  }), [locale]);
  return useTranslation('editor', { i18n: instance });
}
