import type { Metadata } from 'next';
import './globals.css';
import { LayoutTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { layoutNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { Providers } from './providers';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const { t } = await initTranslations(locale, ['common']);
  return {
    title: t('brand.name'),
    description: t('brand.wordmark_alt'),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading the cookie here opts the tree into dynamic rendering. Cove Studio
  // sits entirely behind authentication and was already dynamic, so nothing is
  // lost. See docs/design/2026-07-24-cove-v2-internationalization-design.md §4.2.
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, layoutNamespaces);

  return (
    <html lang={locale}>
      <body>
        <LayoutTranslationsProvider
          locale={locale}
          namespaces={layoutNamespaces}
          resources={resources}
        >
          <Providers>{children}</Providers>
        </LayoutTranslationsProvider>
      </body>
    </html>
  );
}
