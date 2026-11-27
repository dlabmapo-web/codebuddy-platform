import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { aiUsageNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * Mounts the AI teacher page's copy for this route alone, as the point policy
 * page does: a manager's numbers vocabulary has no place in the payload of
 * every page a student opens.
 */
export default async function AiTeacherLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, aiUsageNamespaces);
  return (
    <PageTranslationsProvider locale={locale} namespaces={aiUsageNamespaces} resources={resources}>
      {children}
    </PageTranslationsProvider>
  );
}
