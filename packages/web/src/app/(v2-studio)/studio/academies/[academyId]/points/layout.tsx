import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { pointsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * Mounts the points copy for this route only.
 *
 * An academy without the flag never reaches this layout, so a student whose
 * academy does not use points never carries a leaderboard's vocabulary in
 * their RSC payload.
 */
export default async function PointsLayout({
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
