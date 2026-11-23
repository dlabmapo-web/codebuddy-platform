import type { ReactNode } from 'react';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { examNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

export async function ExamTeachTranslations({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, examNamespaces);
  return <PageTranslationsProvider locale={locale} namespaces={examNamespaces} resources={resources}>{children}</PageTranslationsProvider>;
}
