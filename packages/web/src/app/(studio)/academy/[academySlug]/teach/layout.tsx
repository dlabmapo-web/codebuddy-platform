import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { teachNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * The teaching routes mount their own copy.
 *
 * Live monitoring and Solution status are Teacher-only surfaces, so both
 * namespaces are paid for by these pages rather than riding in every page's
 * RSC payload. The shell keeps its own i18next context, so the sidebar and
 * header are unaffected by what this provides.
 */
export default async function TeachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, teachNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={teachNamespaces}
      resources={resources}
    >
      {children}
    </PageTranslationsProvider>
  );
}
