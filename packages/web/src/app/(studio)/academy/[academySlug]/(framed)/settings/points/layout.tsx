import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { pointsNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

/**
 * Mounts the points copy for the editor, exactly as the points page does.
 *
 * The manager's own labels live in the `points` namespace rather than in
 * `content` beside the feature switches, for two reasons. This page renders
 * the student's rules panel as a preview, so it needs that vocabulary
 * regardless; and `content` is a layout namespace, so filing thirty
 * manager-only strings there would put them in the RSC payload of every page
 * a student opens — which is the trade the payload budget asks the next
 * feature not to make.
 */
export default async function PointPolicyLayout({
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
