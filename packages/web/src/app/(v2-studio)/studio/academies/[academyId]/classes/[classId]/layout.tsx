import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { pointsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * The class detail page mounts the board's own copy.
 *
 * §5.1 — a team lead or manager sees the identical board their students see,
 * inside the class page they already open, which means this route needs the
 * points vocabulary. It is paid for here rather than in `layoutNamespaces`,
 * because a student loading their catalog should not carry a leaderboard's
 * words. `classes` continues to come from the layout instance above.
 */
export default async function ClassDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, pointsNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={pointsNamespaces}
      resources={resources}
    >
      {children}
    </PageTranslationsProvider>
  );
}
