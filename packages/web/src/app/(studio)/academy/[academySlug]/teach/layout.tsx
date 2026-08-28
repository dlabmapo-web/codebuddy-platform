import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { teachNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * The teaching copy for live monitoring, which sits outside `(framed)`.
 *
 * A second copy of `(framed)/teach/layout.tsx` rather than one shared layout a
 * level up: the two groups have separate layout chains by construction, and
 * hoisting this to `[academySlug]` would put the whole teaching vocabulary in
 * a student's payload on every academy route. Duplicating four lines is the
 * cheaper of the two.
 */
export default async function LiveTeachLayout({
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
