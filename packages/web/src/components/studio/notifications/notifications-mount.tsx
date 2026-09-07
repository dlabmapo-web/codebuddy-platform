import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { notificationNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';

import { NotificationBell } from './notification-bell';

/**
 * The bell, with its own copy loaded for it.
 *
 * Its own provider rather than eleven more keys in `layoutNamespaces`: that
 * list is capped by the Korean root-payload budget in `@cove/i18n`'s
 * `locales.spec.ts`, and the note on that budget asks the next feature to
 * split rather than raise it. The same arrangement `SupportBanner` uses.
 */
export async function NotificationsMount() {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, notificationNamespaces);

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={notificationNamespaces}
      resources={resources}
    >
      <NotificationBell />
    </PageTranslationsProvider>
  );
}
