import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { authNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * Mounts the `auth` copy for the signed-out screens.
 *
 * It rides here rather than in every page's RSC payload because nobody reads
 * it once they are signed in. Client components under this layout use
 * `useTranslation` from react-i18next; anything belonging to the app shell
 * keeps using `useLayoutTranslation` and still resolves `common` and `nav`
 * from the root instance.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, authNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={authNamespaces}
      resources={resources}
    >
      {children}
    </PageTranslationsProvider>
  );
}
