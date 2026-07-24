'use client';

import { createInstance, type i18n as I18n, type Resource } from 'i18next';
import { createContext, useState, type ReactNode } from 'react';

import { initTranslations } from './init-translations';

/**
 * The app-shell i18next instance, kept in its own context rather than
 * `I18nextProvider`'s.
 *
 * `useTranslation` resolves to the *nearest* i18next context. The moment a page
 * wraps itself in `PageTranslationsProvider` for a page-only namespace, every
 * shell component under it — sidebar, header, language switcher — would
 * silently lose the layout's namespaces. A separate context makes the shell
 * immune to whatever a page does below it.
 */
export const I18nLayoutContext = createContext<I18n | undefined>(undefined);

export function LayoutTranslationsProvider({
  children,
  locale,
  namespaces,
  resources,
}: {
  children: ReactNode;
  locale: string;
  namespaces: readonly string[];
  resources: Resource;
}) {
  // Created once per mount. `init` resolves synchronously here because the
  // resources are already in hand and no backend has to fetch anything.
  const [i18n] = useState(() => {
    const instance = createInstance();
    void initTranslations(locale, namespaces, instance, resources);
    return instance;
  });

  return (
    <I18nLayoutContext.Provider value={i18n}>
      {children}
    </I18nLayoutContext.Provider>
  );
}
