import type { ReactNode } from 'react';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { examNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { toApiError } from '@/lib/api-errors';

/** The exam pages' translations, mounted once per page. */
export async function ExamTranslations({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, examNamespaces);
  return (
    <PageTranslationsProvider locale={locale} namespaces={examNamespaces} resources={resources}>
      {children}
    </PageTranslationsProvider>
  );
}

/** An exam refusal (not found, feature off, not started…) rendered, anything else rethrown. */
export function examErrorCode(error: unknown): string | null {
  const code = toApiError(error).code;
  return code && (code.startsWith('EXAM_') || code === 'PERMISSION_DENIED' || code === 'ACADEMY_MEMBERSHIP_REQUIRED') ? code : null;
}

export function isUuid(value: string | undefined): value is string {
  return value !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
