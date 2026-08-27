import type { Metadata } from 'next';
import './globals.css';
import { LayoutTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { layoutNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getTheme } from '@/lib/theme/get-theme';
import { themeClassName } from '@/lib/theme/settings';
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
  // The theme cookie rides along at no additional cost.
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  const { resources } = await initTranslations(locale, layoutNamespaces);

  return (
    // `data-theme` drives the `system` half of the dark variant and tells the
    // switcher which option is selected; `className` drives the explicit half.
    // No `suppressHydrationWarning`: server and client read the same cookie and
    // agree on both attributes, so there is nothing to suppress.
    /*
     * Not machine-translated. The app ships Korean and English and offers
     * the choice in its own switcher, so a browser translation adds nothing
     * a reader cannot already get — and it rewrites text nodes underneath
     * React, which breaks reconciliation with `insertBefore` errors. The
     * exercise workspace is the worst place for that: a student loses the
     * code they were writing. `translate="no"` covers the standard
     * attribute; the meta covers Google's older opt-out.
     */
    <html
      className={themeClassName(theme)}
      data-theme={theme}
      lang={locale}
      translate="no"
    >
      <head>
        <meta content="notranslate" name="google" />
      </head>
      <body>
        <LayoutTranslationsProvider
          locale={locale}
          namespaces={layoutNamespaces}
          resources={resources}
        >
          <Providers theme={theme}>{children}</Providers>
        </LayoutTranslationsProvider>
      </body>
    </html>
  );
}
