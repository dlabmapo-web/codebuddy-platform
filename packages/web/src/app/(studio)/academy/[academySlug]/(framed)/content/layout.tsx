import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { contentNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * Mounts the curriculum-authoring copy for these routes only.
 *
 * A student never reaches this layout, so they never carry the vocabulary of a
 * course builder in the payload of the problem they are solving.
 */
export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, contentNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={contentNamespaces}
      resources={resources}
    >
      {children}
    </PageTranslationsProvider>
  );
}
